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
        await _save(
            job_id, status="done", step="Pronto", path=str(output),
            duration=result["duration"], warning=result["warning"],
            scene_bounds=json.dumps(result.get("scene_bounds") or []),
            transcript=json.dumps(result.get("transcript") or []),
        )
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


MAX_TAKES = 12


def _take_json(row: Any) -> dict[str, Any]:
    start, end = float(row.start_seconds), float(row.end_seconds)
    return {
        "id": row.id, "idx": row.idx, "hook_title": row.hook_title, "text": row.text,
        "start": start, "end": end, "duration": round(end - start, 1), "score": float(row.score),
    }


@router.get("/{job_id}/takes")
async def list_takes(job_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    rows = (await db.execute(text(
        "SELECT id, idx, hook_title, text, start_seconds, end_seconds, score FROM video_takes "
        "WHERE final_video_id = :id AND user_id = :u ORDER BY idx"
    ), {"id": _uuid(job_id), "u": user_id})).all()
    return {"takes": [_take_json(r) for r in rows]}


@router.patch("/{job_id}/takes/{take_id}")
async def edit_take(job_id: str, take_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Salva a headline editada à mão de um take."""
    user_id = await _user_id(request, db)
    body = await request.json()
    hook = str(body.get("hook_title") or "").strip()[:200]
    result = await db.execute(text(
        "UPDATE video_takes SET hook_title = :h WHERE id = :id AND final_video_id = :fv AND user_id = :u"
    ), {"h": hook or None, "id": _uuid(take_id), "fv": _uuid(job_id), "u": user_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Take não encontrado")
    await db.commit()
    return {"ok": True, "hook_title": hook or None}


@router.post("/{job_id}/takes")
async def make_takes(job_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Gera takes inteligentes: a IA escolhe os trechos de maior gancho e a gente encaixa nas cenas do Flow."""
    from ...clip_editor import trim_clip_file
    from ...media.ffmpeg import ffprobe_duration
    from ...media.transcription import get_video_transcript
    from ...takes import takes_from_bounds

    user_id = await _user_id(request, db)
    row = (await db.execute(text(
        "SELECT id, status, path, scene_bounds FROM final_videos WHERE id = :id AND user_id = :u"
    ), {"id": _uuid(job_id), "u": user_id})).first()
    if not row or row.status != "done" or not Path(row.path or "").is_file():
        raise HTTPException(status_code=404, detail="O vídeo final não está pronto")
    bounds = json.loads(row.scene_bounds or "[]")
    if len(bounds) < 3:  # 0 ou 1 cena: não há onde dividir em takes
        raise HTTPException(status_code=400, detail="Esse vídeo tem só uma cena; não dá para dividir em takes")

    final_path = Path(row.path)
    transcript = await run_in_thread(get_video_transcript, final_path)
    if not (transcript or "").strip():
        raise HTTPException(status_code=400, detail="Não encontrei fala no vídeo para escolher os takes")
    takes = (await takes_from_bounds(transcript, bounds))[:MAX_TAKES]
    if not takes:
        raise HTTPException(status_code=400, detail="A IA não achou trechos fortes o bastante para virar takes")

    out_dir = _root() / row.id / "takes"
    total = float(ffprobe_duration(final_path))
    old = (await db.execute(text("SELECT path FROM video_takes WHERE final_video_id = :id"), {"id": row.id})).all()
    await db.execute(text("DELETE FROM video_takes WHERE final_video_id = :id"), {"id": row.id})
    for item in old:
        Path(item[0]).unlink(missing_ok=True)

    saved: list[dict[str, Any]] = []
    for take in takes:
        start = float(take["start"])
        end = min(float(take["end"]), total)
        try:
            cut = await run_in_thread(trim_clip_file, final_path, out_dir, start, total - end)
        except Exception:
            # um take que falha no corte não trava os outros
            logger.exception("take cut %.1f-%.1f failed for final %s", start, end, row.id)
            continue
        idx = len(saved)
        take_id = str(uuid.uuid4())
        await db.execute(text(
            "INSERT INTO video_takes (id, user_id, final_video_id, idx, path, hook_title, text, start_seconds, end_seconds, score) "
            "VALUES (:id, :u, :fv, :i, :p, :h, :t, :s, :e, :sc)"
        ), {"id": take_id, "u": user_id, "fv": row.id, "i": idx, "p": str(cut),
            "h": (take.get("hook_title") or "")[:200] or None, "t": take.get("text") or "",
            "s": start, "e": end, "sc": float(take.get("score") or 0.0)})
        saved.append({"id": take_id, "idx": idx, "hook_title": take.get("hook_title"),
                      "start": start, "end": end, "duration": round(end - start, 1), "score": float(take.get("score") or 0.0)})
    await db.commit()
    if not saved:
        raise HTTPException(status_code=400, detail="Não consegui cortar nenhum take deste vídeo")
    return {"takes": saved}


@router.post("/{job_id}/takes/merge")
async def merge_takes(job_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Une todos os takes do vídeo num único arquivo final, pronto para baixar."""
    from ...clip_editor import merge_clip_files

    user_id = await _user_id(request, db)
    row = (await db.execute(text(
        "SELECT id FROM final_videos WHERE id = :id AND user_id = :u"
    ), {"id": _uuid(job_id), "u": user_id})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Vídeo final não encontrado")
    rows = (await db.execute(text(
        "SELECT path FROM video_takes WHERE final_video_id = :id ORDER BY idx"
    ), {"id": row.id})).all()
    paths = [Path(r[0]) for r in rows if Path(r[0] or "").is_file()]
    if not paths:
        raise HTTPException(status_code=400, detail="Não há takes para unir. Gere os takes primeiro.")
    out_dir = _root() / row.id / "takes"
    merged = await run_in_thread(merge_clip_files, paths, out_dir)
    final = out_dir / "_merged.mp4"
    merged.replace(final)
    return {"ok": True, "count": len(paths)}


@router.get("/{job_id}/takes/merge/file")
async def merged_takes_file(job_id: str, request: Request, download: int = 0, db: AsyncSession = Depends(get_db)):
    """Serve o vídeo unido dos takes (download ou inline)."""
    user_id = await _user_id(request, db)
    row = (await db.execute(text(
        "SELECT id FROM final_videos WHERE id = :id AND user_id = :u"
    ), {"id": _uuid(job_id), "u": user_id})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")
    path = _root() / row.id / "takes" / "_merged.mp4"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="O vídeo unido ainda não está pronto")
    return FileResponse(
        path, media_type="video/mp4",
        filename="takes-unidos.mp4" if download else None,
        content_disposition_type="attachment" if download else "inline",
    )
