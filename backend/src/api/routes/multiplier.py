"""
Video Multiplier (BETA).

The user uploads up to 10 hooks, 10 bodies and 3 CTAs; every Hook + Body + CTA
combination is rendered as one video (9:16, 16:9 or 1:1) in the background and
can be previewed, downloaded one by one or as a ZIP.
"""

import asyncio
import itertools
import json
import logging
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import resolve_authenticated_user_id
from ...config import get_config
from ...database import AsyncSessionLocal, get_db
from ...media.ffmpeg import ffprobe_has_audio, run_ffmpeg_command
from ...utils.async_helpers import run_in_thread

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/multiplier", tags=["multiplier"])

MAX_HOOKS = 10
MAX_BODIES = 10
MAX_CTAS = 3
MAX_COMBINATIONS = 60
MAX_JOBS_PER_USER = 20
MAX_FILE_BYTES = 300 * 1024 * 1024
ASPECTS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}

_running: dict[str, str] = {}  # job id -> user id
_render_gate = asyncio.Semaphore(1)


def _root() -> Path:
    path = Path(get_config().temp_dir) / "multiplier"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _job_dir(job_id: str) -> Path:
    return _root() / job_id


async def _user_id(request: Request, db: AsyncSession) -> str:
    return await resolve_authenticated_user_id(request, db, get_config())


def _parse_uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found")


def _job_json(row: Any, with_outputs: bool = True) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": row.id,
        "status": row.status,
        "aspect": row.aspect,
        "total": row.total,
        "done": row.done,
        "error": row.error,
        "created_at": row.created_at,
    }
    if with_outputs:
        try:
            data["outputs"] = json.loads(row.outputs or "[]")
        except ValueError:
            data["outputs"] = []
    return data


async def _fetch_job(db: AsyncSession, job_id: str, user_id: str) -> Any:
    result = await db.execute(
        text(
            "SELECT id, status, aspect, total, done, error, outputs, created_at "
            "FROM multiplier_jobs WHERE id = :id AND user_id = :user_id"
        ),
        {"id": job_id, "user_id": user_id},
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return row



def _scale_chain(index: int, width: int, height: int) -> str:
    return (
        f"[{index}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,"
        f"format=yuv420p[v{index}]"
    )


def ensure_audio(path: Path) -> Path:
    """Return a copy of the video that has an audio track (silent when it had none)."""
    if ffprobe_has_audio(path):
        return path
    target = path.with_name(path.stem + "_a.mp4")
    result = run_ffmpeg_command(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(path), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
            "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(target),
        ],
        timeout=900,
    )
    if result.returncode != 0 or not target.exists():
        raise RuntimeError("could not prepare a video without audio")
    return target


def render_combination(
    parts: list[Path], output: Path, width: int, height: int
) -> None:
    """Concatenate Hook + Body + CTA into one H.264/AAC mp4 of the given size."""
    command: list[str] = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for part in parts:
        command += ["-i", str(part)]
    filters: list[str] = []
    concat_inputs = ""
    for index, _part in enumerate(parts):
        filters.append(_scale_chain(index, width, height))
        filters.append(
            f"[{index}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a{index}]"
        )
        concat_inputs += f"[v{index}][a{index}]"
    filters.append(f"{concat_inputs}concat=n={len(parts)}:v=1:a=1[v][a]")
    command += [
        "-filter_complex", ";".join(filters),
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-movflags", "+faststart",
        str(output),
    ]
    result = run_ffmpeg_command(command, timeout=900)
    if result.returncode != 0 or not output.exists():
        raise RuntimeError("ffmpeg failed to render this combination")


async def _save_progress(job_id: str, **fields: Any) -> None:
    sets = ", ".join(f"{key} = :{key}" for key in fields)
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(f"UPDATE multiplier_jobs SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = :id"),
            {"id": job_id, **fields},
        )
        await session.commit()


async def _run_job(
    job_id: str, combos: list[tuple[int, int, int]], files: dict[str, list[Path]], aspect: str
) -> None:
    width, height = ASPECTS[aspect]
    job_dir = _job_dir(job_id)
    outputs: list[dict[str, Any]] = [
        {
            "index": number,
            "label": f"G{h + 1}-C{b + 1}-F{c + 1}",
            "hook": h + 1,
            "body": b + 1,
            "cta": c + 1,
            "status": "pending",
        }
        for number, (h, b, c) in enumerate(combos, start=1)
    ]
    try:
        async with _render_gate:
            for group in files:
                files[group] = [await run_in_thread(ensure_audio, item) for item in files[group]]
            done = 0
            for number, (h, b, c) in enumerate(combos, start=1):
                target = job_dir / f"out_{number:03d}.mp4"
                try:
                    await run_in_thread(
                        render_combination,
                        [files["hooks"][h], files["bodies"][b], files["ctas"][c]],
                        target,
                        width,
                        height,
                    )
                    outputs[number - 1]["status"] = "ready"
                    outputs[number - 1]["filename"] = target.name
                except Exception as exc:  # one bad combination must not stop the job
                    logger.warning("multiplier %s combo %s failed: %s", job_id, number, exc)
                    outputs[number - 1]["status"] = "error"
                done += 1
                await _save_progress(job_id, done=done, outputs=json.dumps(outputs))
        ready = sum(1 for item in outputs if item["status"] == "ready")
        await _save_progress(
            job_id,
            status="completed" if ready else "error",
            error=None if ready else "Could not render the videos. Check the files and try again.",
            outputs=json.dumps(outputs),
        )
    except Exception as exc:
        logger.exception("multiplier job %s crashed", job_id)
        await _save_progress(job_id, status="error", error=str(exc)[:300])
    finally:
        _running.pop(job_id, None)
        # the inputs are no longer needed once rendering ended
        for folder in ("in",):
            shutil.rmtree(job_dir / folder, ignore_errors=True)


async def _read_group(form: Any, field: str, limit: int, job_dir: Path) -> list[Path]:
    saved: list[Path] = []
    for item in form.getlist(field):
        if not getattr(item, "filename", None) or not hasattr(item, "read"):
            continue
        upload = cast(UploadFile, item)
        extension = Path(upload.filename or "").suffix.lower()
        if extension not in VIDEO_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Only video files are accepted (mp4, mov, webm, mkv)")
        if len(saved) >= limit:
            raise HTTPException(status_code=400, detail=f"At most {limit} files in '{field}'")
        target = job_dir / "in" / f"{field}_{len(saved) + 1}{extension}"
        target.parent.mkdir(parents=True, exist_ok=True)
        written = 0
        with open(target, "wb") as handle:
            while chunk := await upload.read(1024 * 1024):
                written += len(chunk)
                if written > MAX_FILE_BYTES:
                    raise HTTPException(status_code=413, detail="A file is too large (max 300 MB)")
                handle.write(chunk)
        saved.append(target)
    return saved


@router.post("/jobs")
async def create_job(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)

    if user_id in _running.values():
        raise HTTPException(status_code=409, detail="You already have a multiplication running. Wait for it to finish.")
    total_jobs = (
        await db.execute(
            text("SELECT COUNT(*) FROM multiplier_jobs WHERE user_id = :u"), {"u": user_id}
        )
    ).scalar_one()
    if total_jobs >= MAX_JOBS_PER_USER:
        raise HTTPException(status_code=409, detail="Job limit reached. Delete older ones first.")

    form = await request.form()
    aspect = str(form.get("aspect") or "9:16")
    if aspect not in ASPECTS:
        raise HTTPException(status_code=400, detail="Invalid format")

    job_id = str(uuid.uuid4())
    job_dir = _job_dir(job_id)
    try:
        files = {
            "hooks": await _read_group(form, "hooks", MAX_HOOKS, job_dir),
            "bodies": await _read_group(form, "bodies", MAX_BODIES, job_dir),
            "ctas": await _read_group(form, "ctas", MAX_CTAS, job_dir),
        }
        if not files["hooks"] or not files["bodies"] or not files["ctas"]:
            raise HTTPException(status_code=400, detail="Send at least 1 hook, 1 body and 1 CTA")
        combos = list(
            itertools.product(
                range(len(files["hooks"])), range(len(files["bodies"])), range(len(files["ctas"]))
            )
        )
        if len(combos) > MAX_COMBINATIONS:
            raise HTTPException(
                status_code=400,
                detail=f"{len(combos)} combinations is too many (max {MAX_COMBINATIONS} per run)",
            )
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise

    await db.execute(
        text(
            "INSERT INTO multiplier_jobs (id, user_id, status, aspect, total, done, outputs) "
            "VALUES (:id, :user_id, 'processing', :aspect, :total, 0, '[]')"
        ),
        {"id": job_id, "user_id": user_id, "aspect": aspect, "total": len(combos)},
    )
    await db.commit()

    _running[job_id] = user_id
    task = asyncio.create_task(_run_job(job_id, combos, files, aspect))
    task.add_done_callback(lambda _t: None)
    return {"id": job_id, "total": len(combos), "status": "processing"}


@router.get("/jobs")
async def list_jobs(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    await db.execute(
        text(
            "UPDATE multiplier_jobs SET status = 'error', error = 'Interrupted. Please try again.' "
            "WHERE user_id = :u AND status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '2 hours'"
        ),
        {"u": user_id},
    )
    await db.commit()
    result = await db.execute(
        text(
            "SELECT id, status, aspect, total, done, error, outputs, created_at "
            "FROM multiplier_jobs WHERE user_id = :u ORDER BY created_at DESC LIMIT 50"
        ),
        {"u": user_id},
    )
    rows = result.fetchall()
    jobs = []
    for row in rows:
        data = _job_json(row, with_outputs=False)
        if row.status == "processing" and row.id not in _running:
            data["status"] = "error"
            data["error"] = "Interrupted. Please try again."
        jobs.append(data)
    return {"jobs": jobs}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    row = await _fetch_job(db, _parse_uuid(job_id), user_id)
    data = _job_json(row)
    if row.status == "processing" and row.id not in _running:
        data["status"] = "error"
        data["error"] = "Interrupted. Please try again."
    return data


def _ready_file(job_id: str, outputs: list[dict[str, Any]], index: int) -> Path:
    for item in outputs:
        if item.get("index") == index and item.get("status") == "ready":
            path = _job_dir(job_id) / str(item.get("filename", ""))
            if path.name == item.get("filename") and path.exists():
                return path
    raise HTTPException(status_code=404, detail="Video not found")


@router.get("/jobs/{job_id}/outputs/{index}")
async def get_output(
    job_id: str, index: int, request: Request, download: bool = False,
    db: AsyncSession = Depends(get_db),
):
    user_id = await _user_id(request, db)
    row = await _fetch_job(db, _parse_uuid(job_id), user_id)
    outputs = json.loads(row.outputs or "[]")
    path = _ready_file(row.id, outputs, index)
    label = next((o["label"] for o in outputs if o.get("index") == index), f"video-{index}")
    return FileResponse(
        path=str(path),
        media_type="video/mp4",
        filename=f"{label}.mp4",
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/jobs/{job_id}/zip")
async def get_zip(job_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    row = await _fetch_job(db, _parse_uuid(job_id), user_id)
    outputs = [o for o in json.loads(row.outputs or "[]") if o.get("status") == "ready"]
    if not outputs:
        raise HTTPException(status_code=404, detail="No videos ready")
    zip_path = _job_dir(row.id) / "all.zip"

    def build() -> None:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as archive:
            for item in outputs:
                source = _job_dir(row.id) / str(item["filename"])
                if source.exists():
                    archive.write(source, f"{item['label']}.mp4")

    await run_in_thread(build)
    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename="multiplicador.zip",
        content_disposition_type="attachment",
        headers={"Cache-Control": "private, no-store"},
    )


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    job_id = _parse_uuid(job_id)
    row = await _fetch_job(db, job_id, user_id)
    if row.status == "processing" and row.id in _running:
        raise HTTPException(status_code=409, detail="Wait for the rendering to finish")
    await db.execute(
        text("DELETE FROM multiplier_jobs WHERE id = :id AND user_id = :u"),
        {"id": job_id, "u": user_id},
    )
    await db.commit()
    await run_in_thread(shutil.rmtree, _job_dir(job_id), True)
    return {"deleted": True}
