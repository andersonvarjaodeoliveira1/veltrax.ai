"""
Clonagem de Vídeo (BETA) - geração das imagens e das cenas dentro da ferramenta.

Usa a API do Google (paga por uso): uma imagem por chamada e um vídeo por cena (imagem -> vídeo).
Tudo é salvo na pasta do membro para ele baixar depois. Limites diários protegem o custo.

Rotas (todas sob /multiplier/clone/render):
  GET  /status             -> ligado? limites, uso do dia e custo estimado
  POST /image              -> gera uma imagem (síncrono)
  POST /video              -> inicia a geração de uma cena (assíncrono)
  GET  /{id}               -> estado de um item
  GET  /{id}/file          -> arquivo gerado
"""

import asyncio
import base64
import hashlib
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_config
from ...database import get_db
from .multiplier import _root, _user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/multiplier/clone/render", tags=["clone-render"])

API_BASE = "https://generativelanguage.googleapis.com/v1beta"
DAY = 24 * 3600
PROMPT_MAX = 1800
IMAGE_MAX_BYTES = 12 * 1024 * 1024
VIDEO_POLL_SECONDS = 8
VIDEO_TIMEOUT_SECONDS = 15 * 60

_running: dict[str, set[str]] = {}  # user id -> ids of videos being generated
_video_gate = asyncio.Semaphore(4)


def _env_int(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, "") or default))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.getenv(name, "") or default))
    except ValueError:
        return default


def image_model() -> str:
    return os.getenv("CLONE_IMAGE_MODEL", "").strip() or "gemini-3.1-flash-image-preview"


def video_model() -> str:
    return os.getenv("CLONE_VIDEO_MODEL", "").strip() or "veo-3.1-lite-generate-preview"


def api_key() -> str:
    config = get_config()
    return (getattr(config, "veo_api_key", None) or getattr(config, "google_api_key", None) or "").strip()


def limits() -> dict[str, Any]:
    return {
        "images_per_day": _env_int("CLONE_IMAGES_PER_DAY", 30),
        "videos_per_day": _env_int("CLONE_VIDEOS_PER_DAY", 9),
        "price_per_second_usd": _env_float("CLONE_VIDEO_PRICE_PER_SECOND", 0.05),
        "seconds": 8,
    }


# ---- storage --------------------------------------------------------------------
def _user_dir(user_id: str) -> Path:
    digest = hashlib.sha256(user_id.encode()).hexdigest()[:24]
    path = _root() / "generated" / digest
    path.mkdir(parents=True, exist_ok=True)
    return path


def _meta_path(user_id: str, item_id: str) -> Path:
    return _user_dir(user_id) / f"{item_id}.json"


def _parse_id(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(status_code=404, detail="Item not found")


def _write_meta(user_id: str, meta: dict[str, Any]) -> None:
    path = _meta_path(user_id, meta["id"])
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(meta))
    tmp.replace(path)


def _read_meta(user_id: str, item_id: str) -> dict[str, Any]:
    path = _meta_path(user_id, item_id)
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="Item not found")


def _used_today(user_id: str, kind: str) -> int:
    now = time.time()
    total = 0
    for path in _user_dir(user_id).glob("*.json"):
        try:
            meta = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if meta.get("kind") == kind and meta.get("status") != "error" and now - float(meta.get("created", 0)) < DAY:
            total += 1
    return total


def _public(meta: dict[str, Any]) -> dict[str, Any]:
    data = {key: meta.get(key) for key in ("id", "kind", "status", "error", "created")}
    data["url"] = f"/multiplier/clone/render/{meta['id']}/file" if meta.get("status") == "ready" else None
    return data


# ---- Google calls ---------------------------------------------------------------
def _google_error(response: httpx.Response) -> HTTPException:
    status = response.status_code
    logger.warning("clone render: google answered %s: %s", status, response.text[:300])
    if status in (400, 403) and ("billing" in response.text.lower() or "quota" in response.text.lower() or "permission" in response.text.lower()):
        return HTTPException(status_code=503, detail="Generation is not enabled on the Google account (check billing and the key)")
    if status == 429:
        return HTTPException(status_code=429, detail="Google is busy or the quota ended. Try again in a few minutes")
    if status == 404:
        return HTTPException(status_code=503, detail="The generation model is not available anymore. Tell the administrator")
    if status == 400:
        return HTTPException(status_code=422, detail="This prompt was not accepted. Edit it and try again")
    return HTTPException(status_code=502, detail="Could not generate now. Try again")


def _headers() -> dict[str, str]:
    return {"x-goog-api-key": api_key(), "Content-Type": "application/json"}


async def google_image(prompt: str, client: httpx.AsyncClient | None = None) -> tuple[bytes, str]:
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "9:16"}},
    }
    owns = client is None
    client = client or httpx.AsyncClient(timeout=120)
    try:
        response = await client.post(f"{API_BASE}/models/{image_model()}:generateContent", headers=_headers(), json=body)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach the image service. Try again")
    finally:
        if owns:
            await client.aclose()
    if response.status_code != 200:
        raise _google_error(response)
    try:
        for candidate in response.json().get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    return base64.b64decode(inline["data"]), str(inline.get("mimeType") or inline.get("mime_type") or "image/png")
    except (ValueError, AttributeError):
        pass
    raise HTTPException(status_code=422, detail="The image was blocked or came back empty. Edit the prompt and try again")


async def google_video(prompt: str, image: tuple[bytes, str] | None, seconds: int) -> bytes:
    if not video_model().startswith("veo"):
        raise HTTPException(status_code=503, detail="The generation model is not available anymore. Tell the administrator")
    instance: dict[str, Any] = {"prompt": prompt}
    if image:
        instance["image"] = {"inlineData": {"mimeType": image[1], "data": base64.b64encode(image[0]).decode()}}
    parameters: dict[str, Any] = {"aspectRatio": "9:16", "resolution": "720p", "durationSeconds": seconds}
    if image:
        parameters["personGeneration"] = "allow_adult"
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        start = await client.post(
            f"{API_BASE}/models/{video_model()}:predictLongRunning",
            headers=_headers(),
            json={"instances": [instance], "parameters": parameters},
        )
        if start.status_code != 200:
            raise _google_error(start)
        name = start.json().get("name")
        if not name:
            raise HTTPException(status_code=502, detail="Could not generate now. Try again")
        deadline = time.time() + VIDEO_TIMEOUT_SECONDS
        while time.time() < deadline:
            await asyncio.sleep(VIDEO_POLL_SECONDS)
            poll = await client.get(f"{API_BASE}/{name}", headers=_headers())
            if poll.status_code != 200:
                raise _google_error(poll)
            data = poll.json()
            if not data.get("done"):
                continue
            if data.get("error"):
                raise HTTPException(status_code=422, detail="The video was blocked. Edit the prompt and try again")
            samples = (data.get("response", {}).get("generateVideoResponse", {}) or {}).get("generatedSamples") or []
            uri = (samples[0].get("video") or {}).get("uri") if samples else None
            if not uri:
                raise HTTPException(status_code=422, detail="The video was blocked or came back empty. Edit the prompt and try again")
            download = await client.get(uri, headers={"x-goog-api-key": api_key()})
            if download.status_code != 200 or not download.content:
                raise HTTPException(status_code=502, detail="Could not download the generated video. Try again")
            return download.content
    raise HTTPException(status_code=504, detail="The video took too long. Try again")


# ---- routes ---------------------------------------------------------------------
class _ImageIn(BaseModel):
    prompt: str = Field(min_length=10, max_length=PROMPT_MAX)


class _VideoIn(BaseModel):
    prompt: str = Field(min_length=10, max_length=PROMPT_MAX)
    image_id: str | None = None
    seconds: int = 8


def _require_enabled() -> None:
    if not api_key():
        raise HTTPException(status_code=503, detail="Generation inside the tool is not enabled yet")


def _status_payload(user_id: str) -> dict[str, Any]:
    cfg = limits()
    return {
        "enabled": bool(api_key()),
        "images_left": max(0, cfg["images_per_day"] - _used_today(user_id, "image")),
        "videos_left": max(0, cfg["videos_per_day"] - _used_today(user_id, "video")),
        "images_per_day": cfg["images_per_day"],
        "videos_per_day": cfg["videos_per_day"],
        "seconds": cfg["seconds"],
        "scene_cost_usd": round(cfg["price_per_second_usd"] * cfg["seconds"], 2),
    }


@router.get("/status")
async def status(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    return _status_payload(user_id)


@router.post("/image")
async def create_image(body: _ImageIn, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    _require_enabled()
    if _status_payload(user_id)["images_left"] <= 0:
        raise HTTPException(status_code=429, detail="Daily image limit reached. Try again tomorrow")
    content, mime = await google_image(body.prompt.strip())
    extension = ".jpg" if "jpeg" in mime else ".png"
    item_id = str(uuid.uuid4())
    (_user_dir(user_id) / f"{item_id}{extension}").write_bytes(content)
    meta = {"id": item_id, "kind": "image", "status": "ready", "file": f"{item_id}{extension}", "mime": mime, "created": time.time()}
    _write_meta(user_id, meta)
    return _public(meta)


async def _run_video(user_id: str, item_id: str, prompt: str, image: tuple[bytes, str] | None, seconds: int) -> None:
    meta = _read_meta(user_id, item_id)
    try:
        async with _video_gate:
            content = await google_video(prompt, image, seconds)
        name = f"{item_id}.mp4"
        (_user_dir(user_id) / name).write_bytes(content)
        meta.update(status="ready", file=name, mime="video/mp4")
    except HTTPException as exc:
        meta.update(status="error", error=str(exc.detail))
    except Exception:
        logger.exception("clone render video %s crashed", item_id)
        meta.update(status="error", error="Could not generate now. Try again")
    finally:
        _running.get(user_id, set()).discard(item_id)
    _write_meta(user_id, meta)


@router.post("/video")
async def create_video(body: _VideoIn, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    _require_enabled()
    if _status_payload(user_id)["videos_left"] <= 0:
        raise HTTPException(status_code=429, detail="Daily scene limit reached. Try again tomorrow")
    if len(_running.get(user_id, set())) >= 3:
        raise HTTPException(status_code=409, detail="Wait for the scenes in progress to finish")
    image: tuple[bytes, str] | None = None
    if body.image_id:
        meta = _read_meta(user_id, _parse_id(body.image_id))
        path = _user_dir(user_id) / str(meta.get("file", ""))
        if meta.get("kind") != "image" or meta.get("status") != "ready" or path.name != meta.get("file") or not path.exists():
            raise HTTPException(status_code=404, detail="Image not found")
        data = path.read_bytes()
        if len(data) > IMAGE_MAX_BYTES:
            raise HTTPException(status_code=413, detail="The image is too large")
        image = (data, str(meta.get("mime") or "image/png"))
    seconds = body.seconds if body.seconds in (4, 6, 8) else 8
    item_id = str(uuid.uuid4())
    meta = {"id": item_id, "kind": "video", "status": "processing", "created": time.time()}
    _write_meta(user_id, meta)
    _running.setdefault(user_id, set()).add(item_id)
    task = asyncio.create_task(_run_video(user_id, item_id, body.prompt.strip(), image, seconds))
    task.add_done_callback(lambda _t: None)
    return _public(meta)


@router.get("/{item_id}")
async def get_item(item_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    item_id = _parse_id(item_id)
    meta = _read_meta(user_id, item_id)
    if meta.get("status") == "processing" and item_id not in _running.get(user_id, set()):
        meta.update(status="error", error="Interrupted. Please try again.")
    return _public(meta)


@router.get("/{item_id}/file")
async def get_file(item_id: str, request: Request, download: bool = False, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    meta = _read_meta(user_id, _parse_id(item_id))
    path = _user_dir(user_id) / str(meta.get("file", ""))
    if meta.get("status") != "ready" or path.name != meta.get("file") or not path.exists():
        raise HTTPException(status_code=404, detail="Item not found")
    return FileResponse(
        path=str(path),
        media_type=str(meta.get("mime") or "application/octet-stream"),
        filename=path.name,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, no-store"},
    )
