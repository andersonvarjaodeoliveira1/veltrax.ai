"""Vídeos gerados no Google Flow pela extensão (BETA).

A extensão roda dentro do Flow, sem a sessão do ClipGringa. Por isso o site pede um token curto
(`POST /token`, autenticado) e a extensão envia cada vídeo para `POST /upload?token=…`. Os vídeos
ficam guardados no servidor e aparecem na página "Vídeos do Flow" para ver e baixar.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_config
from ...database import get_db
from .multiplier import _user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/multiplier/flow-videos", tags=["flow-videos"])

TOKEN_TTL_SECONDS = 12 * 3600
MAX_VIDEO_BYTES = 150 * 1024 * 1024
MAX_USER_BYTES = 4 * 1024 * 1024 * 1024
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_USER_FILES = 800
IMAGE_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def _image_ext(name: str) -> str | None:
    ext = Path(name.lower()).suffix
    return ext if ext in IMAGE_TYPES else None


def _secret() -> bytes:
    config = get_config()
    secret = getattr(config, "backend_auth_secret", None) or os.getenv("BETTER_AUTH_SECRET") or ""
    if not secret:
        raise HTTPException(status_code=503, detail="Upload token secret is not configured")
    return ("flow-videos:" + secret).encode("utf-8")


def make_token(user_id: str, now: float | None = None) -> str:
    expires = int((now if now is not None else time.time()) + TOKEN_TTL_SECONDS)
    payload = base64.urlsafe_b64encode(f"{user_id}|{expires}".encode()).decode().rstrip("=")
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def read_token(token: str, now: float | None = None) -> str:
    try:
        payload, sig = token.split(".", 1)
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            raise ValueError("bad signature")
        raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)).decode()
        user_id, expires = raw.rsplit("|", 1)
        if int(expires) < (now if now is not None else time.time()):
            raise ValueError("expired")
        return user_id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired upload token")


def _clean(value: str, limit: int) -> str:
    return "".join(ch for ch in (value or "") if ch.isprintable() and ch not in "\\/\r\n")[:limit].strip()


def _root() -> Path:
    return Path(get_config().temp_dir) / "flow_videos"


@router.post("/token")
async def create_token(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    return {"token": make_token(user_id), "expires_in": TOKEN_TTL_SECONDS}


@router.post("/upload")
async def upload_video(request: Request, token: str = "", package: str = "", file: str = "", db: AsyncSession = Depends(get_db)):
    user_id = read_token(token)
    package, file = _clean(package, 120), _clean(file, 160) or "video.mp4"
    image_ext = _image_ext(file)
    limit = MAX_IMAGE_BYTES if image_ext else MAX_VIDEO_BYTES
    declared = int(request.headers.get("content-length") or 0)
    if declared > limit:
        raise HTTPException(status_code=413, detail="File too large")
    usage = (await db.execute(text("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS total FROM flow_videos WHERE user_id = :u AND deleted_at IS NULL"), {"u": user_id})).fetchone()
    if usage and (usage.n >= MAX_USER_FILES or int(usage.total) + declared > MAX_USER_BYTES):
        raise HTTPException(status_code=413, detail="Storage limit reached; delete old videos")
    video_id = str(uuid.uuid4())
    folder = _root() / user_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{video_id}{image_ext or '.mp4'}"
    size = 0
    try:
        with open(path, "wb") as handle:
            async for chunk in request.stream():
                size += len(chunk)
                if size > limit:
                    raise HTTPException(status_code=413, detail="File too large")
                handle.write(chunk)
        if size < 1024:
            raise HTTPException(status_code=400, detail="Empty video")
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    await db.execute(
        text("INSERT INTO flow_videos (id, user_id, package, file, path, size) VALUES (:id, :u, :p, :f, :path, :size)"),
        {"id": video_id, "u": user_id, "p": package, "f": file, "path": str(path), "size": size},
    )
    await db.commit()
    return {"id": video_id, "size": size}


SHOPEE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"


@router.post("/save-from-urls")
async def save_from_urls(request: Request, db: AsyncSession = Depends(get_db)):
    """Guarda no Banco de imagens da pessoa as fotos e vídeos de um anúncio da Shopee (links do CDN da Shopee), sem passar pela pasta do Windows."""
    import httpx

    from .clone_plan import _is_shopee_cdn, _safe_get

    user_id = await _user_id(request, db)
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    package = _clean(str((data or {}).get("package") or "Shopee"), 120) or "Shopee"
    urls = [str(u).strip()[:700] for u in ((data or {}).get("urls") or []) if isinstance(u, str)][:12]
    saved: list[dict[str, str]] = []
    folder = _root() / user_id
    folder.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=45, headers={"User-Agent": SHOPEE_UA, "Referer": "https://shopee.com.br/"}) as http:
        for url in urls:
            if not _is_shopee_cdn(url):
                continue
            is_video = ".mp4" in url.lower().split("?")[0]
            name = f"shopee-{hashlib.sha1(url.split('?')[0].encode()).hexdigest()[:10]}.{'mp4' if is_video else 'jpg'}"
            exists = (await db.execute(text("SELECT id FROM flow_videos WHERE user_id = :u AND file = :f AND deleted_at IS NULL"), {"u": user_id, "f": name})).fetchone()
            if exists:
                saved.append({"id": str(exists.id), "file": name, "kind": "video" if is_video else "image", "existing": "1"})
                continue
            usage = (await db.execute(text("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS total FROM flow_videos WHERE user_id = :u AND deleted_at IS NULL"), {"u": user_id})).fetchone()
            if usage and (usage.n >= MAX_USER_FILES or int(usage.total) >= MAX_USER_BYTES):
                break
            try:
                body, kind = await _safe_get(http, url, MAX_VIDEO_BYTES if is_video else MAX_IMAGE_BYTES)
            except Exception:
                continue
            if len(body) < 1024 or not (kind.startswith("video/") if is_video else kind.startswith("image/")):
                continue
            if not is_video:
                ext = {"image/png": ".png", "image/webp": ".webp"}.get(kind.split(";")[0].strip(), ".jpg")
                name = name.rsplit(".", 1)[0] + ext
            video_id = str(uuid.uuid4())
            path = folder / f"{video_id}{Path(name).suffix}"
            path.write_bytes(body)
            await db.execute(
                text("INSERT INTO flow_videos (id, user_id, package, file, path, size) VALUES (:id, :u, :p, :f, :path, :size)"),
                {"id": video_id, "u": user_id, "p": package, "f": name, "path": str(path), "size": len(body)},
            )
            saved.append({"id": video_id, "file": name, "kind": "video" if is_video else "image"})
    await db.commit()
    return {"saved": saved}


@router.get("")
@router.get("/")
async def list_videos(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    rows = (await db.execute(text(
        "SELECT id, package, file, size, created_at FROM flow_videos WHERE user_id = :u AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 800"), {"u": user_id})).fetchall()
    return {"videos": [{"id": r.id, "package": r.package, "file": r.file, "kind": "image" if _image_ext(r.file or "") else "video", "size": int(r.size), "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]}


async def _own(video_id: str, user_id: str, db: AsyncSession):
    try:
        video_id = str(uuid.UUID(video_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Video not found")
    row = (await db.execute(text("SELECT id, file, path FROM flow_videos WHERE id = :id AND user_id = :u AND deleted_at IS NULL"), {"id": video_id, "u": user_id})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Video not found")
    return row


@router.get("/{video_id}/file")
async def video_file(video_id: str, request: Request, download: int = 0, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    row = await _own(video_id, user_id, db)
    path = Path(row.path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Video file is gone")
    return FileResponse(path, media_type=IMAGE_TYPES.get(_image_ext(row.file or "") or "", "video/mp4"), filename=row.file if download else None, content_disposition_type="attachment" if download else "inline")


@router.delete("/{video_id}")
async def delete_video(video_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    row = await _own(video_id, user_id, db)
    await db.execute(text("UPDATE flow_videos SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": row.id})
    await db.commit()
    try:
        Path(row.path).unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not remove %s", row.path)
    return {"ok": True}
