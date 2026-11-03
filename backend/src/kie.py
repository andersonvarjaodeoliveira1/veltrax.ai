"""Integração com o Kie.ai (geração de imagens com a conta da própria pessoa).

A pessoa cola a chave de API do Kie.ai em "Minhas APIs"; as imagens saem da conta dela (os créditos são dela).
API: https://docs.kie.ai — criar tarefa em /api/v1/jobs/createTask e consultar em /api/v1/jobs/recordInfo.
"""

import asyncio
import json
import logging
import os
import time
from typing import Any

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

KIE_API = "https://api.kie.ai"
POLL_FIRST_SECONDS = 3.0
POLL_MAX_SECONDS = 12.0
IMAGE_TIMEOUT_SECONDS = 5 * 60
ASPECTS = {"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"}


def image_model() -> str:
    return os.getenv("KIE_IMAGE_MODEL", "").strip() or "nano-banana-2"


def _headers(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _error(code: int, message: str) -> HTTPException:
    """Traduz o retorno do Kie.ai para uma mensagem que a pessoa entende."""
    logger.warning("kie: code=%s msg=%s", code, str(message)[:200])
    if code in (401, 403):
        return HTTPException(status_code=401, detail="Kie.ai recusou a chave. Confira a chave em Minhas APIs.")
    if code == 402:
        return HTTPException(status_code=402, detail="Seus créditos do Kie.ai acabaram. Recarregue no site do Kie.ai e tente de novo.")
    if code == 429:
        return HTTPException(status_code=429, detail="O Kie.ai está recebendo pedidos demais. Tente de novo em instantes.")
    if code in (422, 400):
        return HTTPException(status_code=422, detail="O Kie.ai não aceitou este prompt. Edite o texto e tente de novo.")
    return HTTPException(status_code=502, detail="O Kie.ai não conseguiu gerar agora. Tente de novo.")


async def credits(key: str, client: httpx.AsyncClient | None = None) -> float | None:
    """Créditos que sobram na conta (None se não deu para ler). Levanta HTTPException se a chave for recusada."""
    owns = client is None
    client = client or httpx.AsyncClient(timeout=15)
    try:
        response = await client.get(f"{KIE_API}/api/v1/chat/credit", headers=_headers(key))
    except httpx.HTTPError:
        return None
    finally:
        if owns:
            await client.aclose()
    if response.status_code in (401, 403):
        raise _error(401, "unauthorized")
    try:
        data = response.json()
    except ValueError:
        return None
    if int(data.get("code") or 200) in (401, 403):
        raise _error(401, str(data.get("msg")))
    value = data.get("data")
    return float(value) if isinstance(value, (int, float)) else None


async def create_task(client: httpx.AsyncClient, key: str, model: str, payload: dict[str, Any]) -> str:
    try:
        response = await client.post(f"{KIE_API}/api/v1/jobs/createTask", headers=_headers(key), json={"model": model, "input": payload})
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Não consegui falar com o Kie.ai agora. Tente de novo.")
    try:
        data = response.json()
    except ValueError:
        data = {}
    code = int(data.get("code") or response.status_code)
    task_id = (data.get("data") or {}).get("taskId") if isinstance(data.get("data"), dict) else None
    if code != 200 or not task_id:
        raise _error(code, str(data.get("msg") or response.text[:120]))
    return str(task_id)


async def wait_result(client: httpx.AsyncClient, key: str, task_id: str, timeout: float = IMAGE_TIMEOUT_SECONDS) -> list[str]:
    """Espera a tarefa terminar e devolve os links dos resultados."""
    deadline = time.monotonic() + timeout
    delay = POLL_FIRST_SECONDS
    while time.monotonic() < deadline:
        await asyncio.sleep(delay)
        delay = min(POLL_MAX_SECONDS, delay * 1.25)
        try:
            response = await client.get(f"{KIE_API}/api/v1/jobs/recordInfo", params={"taskId": task_id}, headers=_headers(key))
            data = response.json()
        except (httpx.HTTPError, ValueError):
            continue
        if int(data.get("code") or 200) == 429:
            delay = POLL_MAX_SECONDS
            continue
        info = data.get("data") or {}
        state = str(info.get("state") or "").lower()
        if state == "success":
            raw = info.get("resultJson")
            try:
                parsed = json.loads(raw) if isinstance(raw, str) else (raw or {})
            except ValueError:
                parsed = {}
            urls = [str(u) for u in (parsed.get("resultUrls") or []) if u]
            if urls:
                return urls
            raise HTTPException(status_code=422, detail="O Kie.ai terminou, mas a imagem veio vazia. Edite o prompt e tente de novo.")
        if state == "fail":
            fail = str(info.get("failMsg") or "")
            logger.warning("kie task %s failed: %s", task_id, fail[:200])
            raise HTTPException(status_code=422, detail="O Kie.ai não gerou esta imagem" + (f": {fail[:120]}" if fail else "") + ". Edite o prompt e tente de novo.")
    raise HTTPException(status_code=504, detail="O Kie.ai demorou demais para gerar. Tente de novo.")


async def generate_image(key: str, prompt: str, aspect: str = "9:16", references: list[str] | None = None, resolution: str = "1K") -> tuple[bytes, str]:
    """Gera uma imagem na conta do Kie.ai da pessoa e devolve (bytes, mime)."""
    model = image_model()
    payload: dict[str, Any] = {"prompt": prompt, "aspect_ratio": aspect if aspect in ASPECTS else "9:16", "resolution": resolution}
    if references:
        payload["image_input"] = references[:8]
    async with httpx.AsyncClient(timeout=60) as client:
        task_id = await create_task(client, key, model, payload)
        urls = await wait_result(client, key, task_id)
        try:
            image = await client.get(urls[0], timeout=120)
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Não consegui baixar a imagem do Kie.ai. Tente de novo.")
    if image.status_code != 200 or not image.content:
        raise HTTPException(status_code=502, detail="Não consegui baixar a imagem do Kie.ai. Tente de novo.")
    mime = image.headers.get("content-type", "image/png").split(";")[0].strip()
    return image.content, mime if mime.startswith("image/") else "image/png"
