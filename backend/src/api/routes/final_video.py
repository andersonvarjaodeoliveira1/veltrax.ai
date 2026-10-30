"""Vídeo final (BETA): pega as cenas que o Flow gerou, junta, legenda e entrega o MP4 pronto."""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_config
from ...database import AsyncSessionLocal, get_db
from ...final_video import clean_options, render_final
from ...utils.async_helpers import run_in_thread
from .multiplier import _render_gate, _user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/multiplier/final", tags=["final-video"])

MAX_PARTS = 24
MAX_FINALS_PER_USER = 20
MAX_QUEUED_PER_USER = 10  # vários vídeos de uma vez (lote): ficam na fila e saem um por vez
_running: dict[str, str] = {}  # job id -> user id


class FinalRequest(BaseModel):
    video_ids: list[str] = Field(min_length=1, max_length=MAX_PARTS)
    aspect: str = "9:16"
    template: str = "default"
    title: str = ""
    speed: float = 1.0
    captions: bool = True
    silence: str = "off"
    transition: str = "none"
    denoise: bool = False


def _root() -> Path:
    path = Path(get_config().temp_dir) / "final_videos"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(status_code=404, detail="Video not found")


async def _save(job_id: str, **fields: Any) -> None:
    sets = ", ".join(f"{key} = :{key}" for key in fields)
    async with AsyncSessionLocal() as session:
        await session.execute(text(f"UPDATE final_videos SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": job_id, **fields})
        await session.commit()


def _json(row: Any) -> dict[str, Any]:
    return {
        "id": row.id, "status": row.status, "step": row.step or "", "error": row.error, "warning": row.warning or "",
        "duration": row.duration, "created_at": row.created_at.isoformat() if row.created_at else None,
        "options": json.loads(row.options or "{}"),
    }


async def _run(job_id: str, parts: list[Path], options: dict[str, Any]) -> None:
    from ...multiplier_captions import transcribe_words

    work = _root() / job_id
    output = work / "final.mp4"
    loop = asyncio.get_running_loop()

    def progress(step: str) -> None:
        asyncio.run_coroutine_threadsafe(_save(job_id, step=step), loop)

    try:
        async with _render_gate:
            result = await run_in_thread(render_final, parts, output, work, options, transcribe_words, progress)
        await _save(job_id, status="done", step="Pronto", path=str(output), duration=result["duration"], warning=result["warning"])
    except Exception:
        logger.exception("final video %s failed", job_id)
        await _save(job_id, status="error", step="", error="Não consegui montar o vídeo final. Tente de novo.")
        shutil.rmtree(work, ignore_errors=True)
    finally:
        _running.pop(job_id, None)


@router.post("")
async def create_final(body: FinalRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    if sum(1 for owner in _running.values() if owner == user_id) >= MAX_QUEUED_PER_USER:
        raise HTTPException(status_code=409, detail="You already have too many final videos in the queue. Wait for them to finish.")
    total = (await db.execute(text("SELECT COUNT(*) FROM final_videos WHERE user_id = :u"), {"u": user_id})).scalar_one()
    if total >= MAX_FINALS_PER_USER:
        raise HTTPException(status_code=409, detail="Final video limit reached. Delete older ones first.")
    parts: list[Path] = []
    for raw in body.video_ids:
        row = (await db.execute(text("SELECT file, path FROM flow_videos WHERE id = :id AND user_id = :u AND deleted_at IS NULL"), {"id": _uuid(raw), "u": user_id})).fetchone()
        if not row or not Path(row.path).is_file():
            raise HTTPException(status_code=404, detail="Video not found")
        if Path(row.file or "").suffix.lower() not in {".mp4", ".mov", ".m4v", ".webm"}:
            raise HTTPException(status_code=400, detail="Only videos can be joined")
        parts.append(Path(row.path))
    options = clean_options(body.model_dump())
    job_id = str(uuid.uuid4())
    (_root() / job_id).mkdir(parents=True, exist_ok=True)
    await db.execute(
        text("INSERT INTO final_videos (id, user_id, status, step, options) VALUES (:id, :u, 'processing', 'Na fila', :o)"),
        {"id": job_id, "u": user_id, "o": json.dumps(options)},
    )
    await db.commit()
    _running[job_id] = user_id
    asyncio.create_task(_run(job_id, parts, options)).add_done_callback(lambda _t: None)
    return {"id": job_id, "status": "processing"}


async def _own(db: AsyncSession, job_id: str, user_id: str) -> Any:
    row = (await db.execute(text("SELECT id, status, step, error, warning, options, path, duration, created_at FROM final_videos WHERE id = :id AND user_id = :u"), {"id": _uuid(job_id), "u": user_id})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Video not found")
    return row


@router.get("")
async def list_finals(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    rows = (await db.execute(text("SELECT id, status, step, error, warning, options, path, duration, created_at FROM final_videos WHERE user_id = :u ORDER BY created_at DESC LIMIT 20"), {"u": user_id})).fetchall()
    return {"videos": [_json(row) for row in rows]}


@router.get("/{job_id}")
async def get_final(job_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    row = await _own(db, job_id, await _user_id(request, db))
    if row.status == "processing" and row.id not in _running:
        await _save(row.id, status="error", error="Não consegui montar o vídeo final. Tente de novo.")
        row = await _own(db, job_id, await _user_id(request, db))
    return _json(row)


@router.get("/{job_id}/file")
async def final_file(job_id: str, request: Request, download: int = 0, db: AsyncSession = Depends(get_db)):
    row = await _own(db, job_id, await _user_id(request, db))
    path = Path(row.path or "")
    if row.status != "done" or not path.is_file():
        raise HTTPException(status_code=404, detail="Video file is gone")
    return FileResponse(path, media_type="video/mp4", filename="video-final.mp4" if download else None, content_disposition_type="attachment" if download else "inline")


@router.delete("/{job_id}")
async def delete_final(job_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    row = await _own(db, job_id, await _user_id(request, db))
    await db.execute(text("DELETE FROM final_videos WHERE id = :id"), {"id": row.id})
    await db.commit()
    shutil.rmtree(_root() / row.id, ignore_errors=True)
    return {"ok": True}
