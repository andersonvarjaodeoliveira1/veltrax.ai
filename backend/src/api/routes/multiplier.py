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
import os
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any, cast

import httpx
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import resolve_authenticated_user_id
from ...config import get_config
from ...database import AsyncSessionLocal, get_db
from ...media.ffmpeg import can_join_without_reencoding, ffprobe_duration, ffprobe_has_audio, h264_encode_args, run_ffmpeg_command
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


def _cards_url() -> str:
    """Optional text-card service (BETA, separate container). Empty = disabled."""
    return os.getenv("CARDS_URL", "").strip().rstrip("/")


async def _render_card(text_value: str, button: str, aspect: str, target: Path, seconds: int = 3) -> None:
    headers = {"Content-Type": "application/json"}
    token = os.getenv("CARDS_TOKEN", "")
    if token:
        headers["x-cards-token"] = token
    async with httpx.AsyncClient(timeout=150) as client:
        response = await client.post(
            f"{_cards_url()}/render",
            headers=headers,
            json={"text": text_value, "button": button, "aspect": aspect, "seconds": seconds},
        )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Could not create the text card. Try again.")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(response.content)


# ---- Automatic variations of a single creative (BETA) --------------------------
MAX_VARIATIONS = 12
MAX_SOURCE_SECONDS = 600

GRADES = {
    "warm": "eq=saturation=1.2:contrast=1.1:brightness=0.03,colorbalance=rs=0.25:rm=0.22:rh=0.12:gs=0.05:bs=-0.25:bm=-0.22:bh=-0.12",
    "cool": "eq=saturation=1.15:contrast=1.08,colorbalance=rs=-0.22:rm=-0.2:rh=-0.1:bs=0.28:bm=0.24:bh=0.12",
    "vivid": "eq=saturation=1.5:contrast=1.12:brightness=0.02",
    "drama": "eq=saturation=0.85:contrast=1.25:brightness=-0.04,vignette=PI/5",
    "pb": "hue=s=0,eq=contrast=1.15",
    "sepia": "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
    "claro": "eq=brightness=0.10:contrast=0.95:saturation=1.1",
    "contraste": "eq=contrast=1.35:saturation=1.1:brightness=-0.02",
}

# Ordered by how different they look; the first N are used.
RECIPES: list[dict[str, Any]] = [
    {"key": "zoom", "zoom": 0.88},
    {"key": "quente", "grade": "warm"},
    {"key": "frio", "grade": "cool"},
    {"key": "vivo", "grade": "vivid"},
    {"key": "rapido", "speed": 1.10},
    {"key": "lento", "speed": 0.92},
    {"key": "zoom-quente", "zoom": 0.90, "grade": "warm"},
    {"key": "drama", "grade": "drama"},
    {"key": "inicio", "skip": 1.5},
    {"key": "rapido-vivo", "speed": 1.08, "grade": "vivid"},
    {"key": "zoom-frio", "zoom": 0.90, "grade": "cool"},
    {"key": "lento-quente", "speed": 0.93, "grade": "warm"},
]

GRADE_LABELS = {
    "warm": "Tom quente (mais laranja)",
    "cool": "Tom frio (mais azulado)",
    "vivid": "Cores mais vivas",
    "drama": "Contraste forte com bordas escuras",
    "pb": "Preto e branco",
    "sepia": "Sépia (tom antigo)",
    "claro": "Mais claro e luminoso",
    "contraste": "Contraste alto",
}

# Effects the user can pick one by one (key -> recipe). Keys are what the form sends.
EFFECTS: dict[str, dict[str, Any]] = {
    "zoom": {"key": "zoom", "zoom": 0.88},
    "quente": {"key": "quente", "grade": "warm"},
    "frio": {"key": "frio", "grade": "cool"},
    "vivo": {"key": "vivo", "grade": "vivid"},
    "drama": {"key": "drama", "grade": "drama"},
    "pb": {"key": "pb", "grade": "pb"},
    "sepia": {"key": "sepia", "grade": "sepia"},
    "claro": {"key": "claro", "grade": "claro"},
    "contraste": {"key": "contraste", "grade": "contraste"},
    "rapido": {"key": "rapido", "speed": 1.10},
    "lento": {"key": "lento", "speed": 0.92},
    "inicio": {"key": "inicio", "skip": 1.5},
}


def describe_recipe(recipe: dict[str, Any], mirror: bool) -> list[str]:
    """Human-readable (pt-BR) list of what was changed in one variation."""
    changes: list[str] = []
    if recipe.get("zoom"):
        changes.append(f"Zoom de {round((1 - float(recipe['zoom'])) * 100)}%")
    if recipe.get("grade"):
        changes.append(GRADE_LABELS.get(recipe["grade"], "Cor ajustada"))
    speed = float(recipe.get("speed", 1.0))
    if speed > 1.0:
        changes.append(f"Mais rápido (+{round((speed - 1) * 100)}%)")
    elif speed < 1.0:
        changes.append(f"Mais lento (-{round((1 - speed) * 100)}%)")
    if recipe.get("skip"):
        changes.append(f"Início cortado ({float(recipe['skip']):g} s)")
    if mirror:
        changes.append("Espelhado")
    return changes


LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MUSIC_EXTENSIONS = {".mp3", ".m4a", ".wav", ".aac", ".ogg"}
MAX_LOGO_BYTES = 5 * 1024 * 1024
MAX_MUSIC_BYTES = 30 * 1024 * 1024
LOGO_POSITIONS = {
    "tl": "{m}:{m}",
    "tr": "W-w-{m}:{m}",
    "bl": "{m}:H-h-{m}",
    "br": "W-w-{m}:H-h-{m}",
}
LOGO_POSITION_LABELS = {
    "tl": "canto superior esquerdo",
    "tr": "canto superior direito",
    "bl": "canto inferior esquerdo",
    "br": "canto inferior direito",
}


def describe_extras(captions: str, logo_position: str | None, music: bool) -> list[str]:
    extras: list[str] = []
    if captions == "auto":
        extras.append("Legenda automática")
    elif captions == "edited":
        extras.append("Legenda revisada")
    if logo_position:
        extras.append(f"Logo ({LOGO_POSITION_LABELS.get(logo_position, 'no canto')})")
    if music:
        extras.append("Música de fundo")
    return extras


def render_variation(
    source: Path,
    output: Path,
    width: int,
    height: int,
    recipe: dict[str, Any],
    mirror: bool,
    ass_path: Path | None = None,
    fonts_dir: Path | None = None,
    logo: Path | None = None,
    logo_position: str = "tr",
    music: Path | None = None,
    music_volume: float = 0.25,
) -> None:
    """Render one automatic variation of a creative, optionally with captions, a logo and music."""
    speed = float(recipe.get("speed", 1.0))
    video = []
    if mirror:
        video.append("hflip")
    zoom = recipe.get("zoom")
    if zoom:
        video.append(f"crop=iw*{zoom}:ih*{zoom}")
    video.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease")
    video.append(f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black")
    video.append("setsar=1")
    video.append("fps=30")
    grade = recipe.get("grade")
    if grade:
        video.append(GRADES[grade])
    if ass_path is not None:
        # After mirror/zoom (so text is never flipped or cropped) and before setpts (so it follows the speed).
        from ...media.ffmpeg import subtitles_filter_fragment

        video.append(subtitles_filter_fragment(ass_path, fonts_dir))
    if speed != 1.0:
        video.append(f"setpts=PTS/{speed}")
    video.append("format=yuv420p")
    audio = []
    if speed != 1.0:
        audio.append(f"atempo={speed}")
    audio.append("aresample=48000")
    audio.append("aformat=sample_fmts=fltp:channel_layouts=stereo")

    command: list[str] = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    skip = float(recipe.get("skip", 0) or 0)
    if skip:
        command += ["-ss", str(skip)]
    command += ["-i", str(source)]
    next_input = 1
    logo_index = music_index = None
    if logo is not None:
        command += ["-loop", "1", "-framerate", "30", "-i", str(logo)]
        logo_index = next_input
        next_input += 1
    if music is not None:
        command += ["-stream_loop", "-1", "-i", str(music)]
        music_index = next_input

    graph = [f"[0:v]{','.join(video)}[v0]"]
    if logo_index is not None:
        margin = max(12, round(width * 0.035))
        where = LOGO_POSITIONS.get(logo_position, LOGO_POSITIONS["tr"]).format(m=margin)
        graph.append(
            f"[{logo_index}:v]scale={round(width * 0.2)}:-1,format=rgba,colorchannelmixer=aa=0.92[lg]"
        )
        graph.append(f"[v0][lg]overlay={where}:shortest=1,format=yuv420p[v]")
    else:
        graph.append("[v0]null[v]")
    graph.append(f"[0:a]{','.join(audio)}[a0]")
    if music_index is not None:
        volume = max(0.02, min(1.0, float(music_volume)))
        graph.append(
            f"[{music_index}:a]volume={volume},aresample=48000,"
            "aformat=sample_fmts=fltp:channel_layouts=stereo[m]"
        )
        graph.append("[a0][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]")
    else:
        graph.append("[a0]anull[a]")

    command += [
        "-filter_complex", ";".join(graph),
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-movflags", "+faststart",
    ]
    if logo is not None or music is not None:
        command += ["-shortest"]
    command += [str(output)]
    result = run_ffmpeg_command(command, timeout=900)
    if result.returncode != 0 or not output.exists():
        raise RuntimeError("ffmpeg failed to render this variation")


def _card_specs(form: Any, field: str, button_field: str | None, seconds: int) -> list[tuple[str, str, int]]:
    """Text cards requested in the form: [(text, button, seconds)], at most 10."""
    texts = [str(item).strip()[:220] for item in form.getlist(field)]
    buttons = [str(item).strip()[:40] for item in form.getlist(button_field)] if button_field else []
    specs: list[tuple[str, str, int]] = []
    for index, value in enumerate(texts):
        if value:
            specs.append((value, buttons[index] if index < len(buttons) else "", seconds))
    return specs[:10]


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
    """Concatenate Hook + Body + CTA into one H.264/AAC mp4 of the given size.

    Fast path: when every clip already has the same codec, size and rate (the Flow's videos do), the clips are joined by
    copying the streams, which takes about a second. Otherwise they are re-encoded (on the GPU when there is one)."""
    if len(parts) > 1 and can_join_without_reencoding(parts, width, height):
        listing = output.with_suffix(".txt")
        listing.write_text("".join("file '" + str(part.resolve()).replace("'", "'\\''") + "'\n" for part in parts), encoding="utf-8")
        try:
            fast = run_ffmpeg_command(
                ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                 "-c", "copy", "-movflags", "+faststart", str(output)],
                timeout=300,
            )
        finally:
            listing.unlink(missing_ok=True)
        if fast.returncode == 0 and output.exists() and output.stat().st_size > 0:
            return
        output.unlink(missing_ok=True)
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
        *h264_encode_args(21),
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
    job_id: str,
    combos: list[tuple[int, int, int]],
    files: dict[str, list[Path]],
    aspect: str,
    cards: dict[str, list[tuple[str, str, int]]] | None = None,
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
            for group, specs in (cards or {}).items():
                for number, (card_text, card_button, card_seconds) in enumerate(specs, start=1):
                    target = job_dir / "in" / f"{group}_card{number}.mp4"
                    await _render_card(card_text, card_button, aspect, target, card_seconds)
                    files[group].append(target)
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


async def _read_group(
    form: Any, field: str, limit: int, job_dir: Path,
    extensions: set[str] | None = None, max_bytes: int | None = None, kind: str = "video",
) -> list[Path]:
    allowed = extensions or VIDEO_EXTENSIONS
    cap = max_bytes or MAX_FILE_BYTES
    saved: list[Path] = []
    for item in form.getlist(field):
        if not getattr(item, "filename", None) or not hasattr(item, "read"):
            continue
        upload = cast(UploadFile, item)
        extension = Path(upload.filename or "").suffix.lower()
        if extension not in allowed:
            if kind == "logo":
                raise HTTPException(status_code=400, detail="The logo must be an image (png, jpg, webp)")
            if kind == "music":
                raise HTTPException(status_code=400, detail="The music must be an audio file (mp3, m4a, wav)")
            raise HTTPException(status_code=400, detail="Only video files are accepted (mp4, mov, webm, mkv)")
        if len(saved) >= limit:
            raise HTTPException(status_code=400, detail=f"At most {limit} files in '{field}'")
        target = job_dir / "in" / f"{field}_{len(saved) + 1}{extension}"
        target.parent.mkdir(parents=True, exist_ok=True)
        written = 0
        with open(target, "wb") as handle:
            while chunk := await upload.read(1024 * 1024):
                written += len(chunk)
                if written > cap:
                    if kind == "logo":
                        raise HTTPException(status_code=413, detail="The logo is too large (max 5 MB)")
                    if kind == "music":
                        raise HTTPException(status_code=413, detail="The music is too large (max 30 MB)")
                    raise HTTPException(status_code=413, detail="A file is too large (max 300 MB)")
                handle.write(chunk)
        saved.append(target)
    return saved


@router.get("/features")
async def features(request: Request, db: AsyncSession = Depends(get_db)):
    await _user_id(request, db)
    return {"cards": bool(_cards_url())}


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
        # Optional text cards (BETA), rendered later in the background by the cards service
        cards = {
            "hooks": _card_specs(form, "hook_text", None, 3),
            "bodies": _card_specs(form, "body_text", None, 5),
            "ctas": _card_specs(form, "cta_text", "cta_button", 3),
        }
        if any(cards.values()) and not _cards_url():
            raise HTTPException(status_code=400, detail="Text cards are not available right now")
        counts = {key: len(files[key]) + len(cards[key]) for key in files}
        if counts["hooks"] > MAX_HOOKS:
            raise HTTPException(status_code=400, detail=f"At most {MAX_HOOKS} hooks")
        if counts["bodies"] > MAX_BODIES:
            raise HTTPException(status_code=400, detail=f"At most {MAX_BODIES} bodies")
        if counts["ctas"] > MAX_CTAS:
            raise HTTPException(status_code=400, detail=f"At most {MAX_CTAS} CTAs")
        if not counts["hooks"] or not counts["bodies"] or not counts["ctas"]:
            raise HTTPException(status_code=400, detail="Send at least 1 hook, 1 body and 1 CTA")
        combos = list(
            itertools.product(
                range(counts["hooks"]), range(counts["bodies"]), range(counts["ctas"])
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
    task = asyncio.create_task(_run_job(job_id, combos, files, aspect, cards))
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


async def _run_variations_job(
    job_id: str, source: Path, recipes: list[dict[str, Any]], aspect: str, mirror: bool,
    captions: str = "none", caption_words: list[dict[str, Any]] | None = None,
    logo: Path | None = None, logo_position: str = "tr",
    music: Path | None = None, music_volume: float = 0.25,
) -> None:
    from ...multiplier_captions import build_ass, shift_words, transcribe_words

    width, height = ASPECTS[aspect]
    job_dir = _job_dir(job_id)
    extras = describe_extras(captions, logo_position if logo else None, music is not None)
    outputs: list[dict[str, Any]] = [
        {
            "index": number,
            "label": f"variacao-{number}-{recipe['key']}" + ("-espelhado" if mirror else ""),
            "changes": describe_recipe(recipe, mirror) + extras,
            "status": "pending",
        }
        for number, recipe in enumerate(recipes, start=1)
    ]
    try:
        async with _render_gate:
            prepared = await run_in_thread(ensure_audio, source)
            words: list[dict[str, Any]] = list(caption_words or [])
            if captions == "auto" and not words:
                try:
                    words = await run_in_thread(transcribe_words, source)
                except Exception as exc:
                    logger.warning("variations %s transcription failed: %s", job_id, exc)
                    raise RuntimeError("Could not create the captions. Try again or send without captions.")
                if not words:
                    raise RuntimeError("No speech was found in this video, so there are no captions to add.")
            done = 0
            for number, recipe in enumerate(recipes, start=1):
                target = job_dir / f"out_{number:03d}.mp4"
                try:
                    ass_path: Path | None = None
                    fonts_dir: Path | None = None
                    if words:
                        shifted = shift_words(words, float(recipe.get("skip", 0) or 0))
                        candidate = job_dir / f"captions_{number:03d}.ass"
                        written, fonts_dir = await run_in_thread(build_ass, shifted, width, height, candidate)
                        ass_path = candidate if written else None
                    await run_in_thread(
                        render_variation, prepared, target, width, height, recipe, mirror,
                        ass_path, fonts_dir, logo, logo_position, music, music_volume,
                    )
                    outputs[number - 1]["status"] = "ready"
                    outputs[number - 1]["filename"] = target.name
                except Exception as exc:  # one bad variation must not stop the job
                    logger.warning("variations %s #%s failed: %s", job_id, number, exc)
                    outputs[number - 1]["status"] = "error"
                done += 1
                await _save_progress(job_id, done=done, outputs=json.dumps(outputs))
        ready = sum(1 for item in outputs if item["status"] == "ready")
        await _save_progress(
            job_id,
            status="completed" if ready else "error",
            error=None if ready else "Could not create the variations. Check the video and try again.",
            outputs=json.dumps(outputs),
        )
    except Exception as exc:
        logger.exception("variations job %s crashed", job_id)
        await _save_progress(job_id, status="error", error=str(exc)[:300])
    finally:
        _running.pop(job_id, None)
        shutil.rmtree(job_dir / "in", ignore_errors=True)


DRAFT_TTL_SECONDS = 24 * 3600
DRAFT_LIMIT_PER_HOUR = 10
_draft_calls: dict[str, list[float]] = {}


def _drafts_root() -> Path:
    path = _root() / "drafts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _purge_old_drafts() -> None:
    import time

    now = time.time()
    for child in _drafts_root().iterdir():
        try:
            if child.is_dir() and now - child.stat().st_mtime > DRAFT_TTL_SECONDS:
                shutil.rmtree(child, ignore_errors=True)
        except OSError:
            continue


def _read_draft(draft_id: str, user_id: str) -> tuple[Path, Path]:
    """(draft dir, video path) of a draft owned by `user_id`."""
    folder = _drafts_root() / _parse_uuid(draft_id)
    meta_path = folder / "meta.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Draft not found")
    meta = json.loads(meta_path.read_text())
    video = folder / str(meta.get("video", ""))
    if meta.get("user_id") != user_id or video.parent != folder or not video.exists():
        raise HTTPException(status_code=404, detail="Draft not found")
    return folder, video


@router.post("/captions/draft")
async def create_caption_draft(request: Request, db: AsyncSession = Depends(get_db)):
    """Upload a creative, transcribe it and return editable caption lines (BETA)."""
    import time

    from ...multiplier_captions import lines_from_words, transcribe_words

    user_id = await _user_id(request, db)
    from ...integrations import load_user_keys

    await load_user_keys(db, user_id)  # usa a chave Claude/Gemini da própria pessoa quando existe
    now = time.time()
    recent = [stamp for stamp in _draft_calls.get(user_id, []) if now - stamp < 3600]
    if len(recent) >= DRAFT_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many caption requests. Try again later.")
    _draft_calls[user_id] = recent + [now]
    _purge_old_drafts()

    form = await request.form()
    draft_id = str(uuid.uuid4())
    folder = _drafts_root() / draft_id
    try:
        saved = await _read_group(form, "video", 1, folder)
        if not saved:
            raise HTTPException(status_code=400, detail="Send a video")
        video = folder / saved[0].name
        shutil.move(str(saved[0]), str(video))
        shutil.rmtree(folder / "in", ignore_errors=True)
        try:
            duration = await run_in_thread(ffprobe_duration, video)
        except Exception:
            raise HTTPException(status_code=400, detail="Could not read this video")
        if duration > MAX_SOURCE_SECONDS:
            raise HTTPException(status_code=400, detail="The creative is too long (max 10 minutes)")
        has_audio = True
        try:
            has_audio = bool(await run_in_thread(ffprobe_has_audio, video))
        except Exception:
            has_audio = True
        if not has_audio:
            # Vídeo mudo (legenda queimada na imagem): a IA lê o texto que aparece nos quadros.
            lines = await _read_onscreen_text(video, duration, folder)
            if not lines:
                raise HTTPException(status_code=422, detail="No speech was found in this video")
            (folder / "meta.json").write_text(json.dumps({"user_id": user_id, "video": video.name}))
            return {"draft_id": draft_id, "duration": duration, "lines": lines, "source": "onscreen"}
        try:
            words = await run_in_thread(transcribe_words, video)
        except Exception as exc:
            logger.warning("caption draft transcription failed: %s", exc)
            raise HTTPException(status_code=502, detail="Could not create the captions. Try again.")
        if not words:
            raise HTTPException(status_code=422, detail="No speech was found in this video")
        (folder / "meta.json").write_text(json.dumps({"user_id": user_id, "video": video.name}))
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    return {"draft_id": draft_id, "duration": duration, "lines": lines_from_words(words)}


class _OnScreenText(BaseModel):
    lines: list[str] = Field(default_factory=list)


async def _read_onscreen_text(video: Path, duration: float, folder: Path) -> list[dict[str, Any]]:
    """Silent video: extracts evenly spaced frames and asks the vision model to read the subtitles burned into them."""
    from pydantic_ai import BinaryContent

    from .clone_plan import _normalize_photo, _run_parts

    count = max(4, min(24, int(duration // 6) or 4))
    frames = folder / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    rate = max(0.05, count / max(duration, 1.0))
    try:
        await run_in_thread(run_ffmpeg_command, ["ffmpeg", "-y", "-i", str(video), "-vf", f"fps={rate:.4f},scale=540:-2", "-frames:v", str(count), "-q:v", "5", str(frames / "f_%03d.jpg")])
    except Exception:
        logger.warning("frame extraction failed", exc_info=True)
        return []
    parts: list[Any] = [
        "These frames come from one short video, in order. The video has no audio: the script is shown as subtitles burned into the picture. "
        "Read those subtitles and write the script in order as short spoken sentences, in the same language as the subtitles, without repeating a sentence that "
        "appears in several frames and without describing the picture. If the frames have no readable text, return an empty list."
    ]
    for frame in sorted(frames.glob("f_*.jpg")):
        fixed = _normalize_photo(frame.read_bytes(), 540)
        if fixed:
            parts.append(BinaryContent(data=fixed[0], media_type=fixed[1]))
    shutil.rmtree(frames, ignore_errors=True)
    if len(parts) < 2:
        return []
    out = await _run_parts("You read subtitles burned into video frames.", _OnScreenText, parts)
    sentences = [" ".join(str(item).split()) for item in out.lines if str(item).strip()][:60]
    step = duration / max(len(sentences), 1)
    return [{"text": text_, "start": round(i * step, 3), "end": round((i + 1) * step, 3)} for i, text_ in enumerate(sentences)]


@router.post("/variations")
async def create_variations(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    if user_id in _running.values():
        raise HTTPException(status_code=409, detail="You already have a job running. Wait for it to finish.")
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
    try:
        count = int(str(form.get("count") or "6"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid count")
    count = max(1, min(MAX_VARIATIONS, count))
    mirror = str(form.get("mirror") or "").lower() in {"1", "true", "on", "yes"}

    job_id = str(uuid.uuid4())
    job_dir = _job_dir(job_id)
    try:
        draft_id = str(form.get("draft_id") or "").strip()
        if draft_id:
            folder, draft_video = _read_draft(draft_id, user_id)
            (job_dir / "in").mkdir(parents=True, exist_ok=True)
            source = job_dir / "in" / f"video_1{draft_video.suffix}"
            shutil.move(str(draft_video), str(source))
            shutil.rmtree(folder, ignore_errors=True)
        else:
            saved = await _read_group(form, "video", 1, job_dir)
            if not saved:
                raise HTTPException(status_code=400, detail="Send a video")
            source = saved[0]
        logo_files = await _read_group(form, "logo", 1, job_dir, LOGO_EXTENSIONS, MAX_LOGO_BYTES, "logo")
        music_files = await _read_group(form, "music", 1, job_dir, MUSIC_EXTENSIONS, MAX_MUSIC_BYTES, "music")
        logo = logo_files[0] if logo_files else None
        music = music_files[0] if music_files else None
        logo_position = str(form.get("logo_position") or "tr")
        if logo_position not in LOGO_POSITIONS:
            logo_position = "tr"
        try:
            music_volume = float(str(form.get("music_volume") or "0.25"))
        except ValueError:
            music_volume = 0.25
        captions = str(form.get("captions") or "none")
        if captions not in {"none", "auto"}:
            captions = "none"
        caption_words: list[dict[str, Any]] = []
        raw_lines = str(form.get("caption_lines") or "").strip()
        if raw_lines:
            from ...multiplier_captions import words_from_lines

            try:
                caption_words = words_from_lines(json.loads(raw_lines))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid captions")
            if not caption_words:
                raise HTTPException(status_code=400, detail="Invalid captions")
            captions = "edited"
        try:
            duration = await run_in_thread(ffprobe_duration, source)
        except Exception:
            raise HTTPException(status_code=400, detail="Could not read this video")
        if duration > MAX_SOURCE_SECONDS:
            raise HTTPException(status_code=400, detail="The creative is too long (max 10 minutes)")
        chosen = [str(value) for value in form.getlist("effects")]
        if chosen:
            picked = [EFFECTS[key] for key in dict.fromkeys(chosen) if key in EFFECTS]
            recipes = [r for r in picked if not (r.get("skip") and duration < 6)][:MAX_VARIATIONS]
            if not recipes:
                raise HTTPException(status_code=400, detail="Pick at least one effect")
        else:
            recipes = [
                recipe for recipe in RECIPES if not (recipe.get("skip") and duration < 6)
            ][:count]
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
        {"id": job_id, "user_id": user_id, "aspect": aspect, "total": len(recipes)},
    )
    await db.commit()

    _running[job_id] = user_id
    task = asyncio.create_task(
        _run_variations_job(
            job_id, source, recipes, aspect, mirror,
            captions, caption_words, logo, logo_position, music, music_volume,
        )
    )
    task.add_done_callback(lambda _t: None)
    return {"id": job_id, "total": len(recipes), "status": "processing"}


# ---- AI copy: hooks, bodies and CTAs from a product description (BETA) -----------
SCRIPT_LIMIT_PER_HOUR = 20
_script_calls: dict[str, list[float]] = {}

SCRIPT_SYSTEM_PROMPT = """You write copy for short vertical video ads (TikTok, Reels, Shorts) in Brazilian Portuguese.
The user describes a product. Produce text for three parts of the video:
- hooks: 3 different opening lines that stop the scroll in the first seconds (max 70 characters each). Use curiosity, a question, a bold but honest statement or a relatable problem. Each hook takes a different angle.
- bodies: 2 short body texts (max 200 characters each) that explain the benefit and how the product helps, in simple everyday language.
- ctas: 2 calls to action. Each has a short line (max 60 characters) and a button label (max 24 characters, verb first, for example "Quero o meu").
Rules: never invent prices, discounts, deadlines, statistics, awards or testimonials that were not given. No guaranteed results and no medical, financial-return or "miracle" claims. No emojis. Do not mention competitors. Write only what the product description supports."""


class _CtaCopy(BaseModel):
    text: str = Field(description="Call to action line, max 60 characters")
    button: str = Field(description="Button label, max 24 characters")


class _AdCopy(BaseModel):
    hooks: list[str] = Field(description="3 opening lines, max 70 characters each")
    bodies: list[str] = Field(description="2 body texts, max 200 characters each")
    ctas: list[_CtaCopy] = Field(description="2 calls to action")


def _clip(value: str, limit: int) -> str:
    value = " ".join(str(value).split())
    return value if len(value) <= limit else value[: limit - 1].rstrip() + "…"


def _check_script_rate(user_id: str) -> None:
    import time

    now = time.time()
    recent = [stamp for stamp in _script_calls.get(user_id, []) if now - stamp < 3600]
    if len(recent) >= SCRIPT_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many AI requests. Try again in a while.")
    recent.append(now)
    _script_calls[user_id] = recent


async def _generate_copy(product: str, tone: str, model: Any = None) -> dict[str, Any]:
    from pydantic_ai import Agent

    if model is None:
        from ...ai import _build_transcript_model, _get_missing_llm_key_error
        from ...runtime_settings import apply_settings_to_process_env

        runtime_config = get_config()
        apply_settings_to_process_env(runtime_config.as_runtime_settings())
        config_error = _get_missing_llm_key_error(runtime_config.llm, runtime_config)
        if config_error:
            logger.error("multiplier script: %s", config_error)
            raise HTTPException(status_code=503, detail="AI is not configured right now")
        model = _build_transcript_model(runtime_config)

    agent = Agent(model, output_type=_AdCopy, system_prompt=SCRIPT_SYSTEM_PROMPT, output_retries=2)
    prompt = f"Product description:\n{product}\n\nTone: {tone or 'direct and friendly'}"
    try:
        result = await asyncio.wait_for(agent.run(prompt), timeout=90)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI took too long. Try again.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("multiplier script generation failed")
        raise HTTPException(status_code=502, detail="Could not generate the texts. Try again.")
    data = result.output
    hooks = [_clip(item, 90) for item in data.hooks if item.strip()][:3]
    bodies = [_clip(item, 220) for item in data.bodies if item.strip()][:2]
    ctas = [
        {"text": _clip(item.text, 70), "button": _clip(item.button, 28)}
        for item in data.ctas
        if item.text.strip()
    ][:2]
    if not hooks or not bodies or not ctas:
        raise HTTPException(status_code=502, detail="Could not generate the texts. Try again.")
    return {"hooks": hooks, "bodies": bodies, "ctas": ctas}


@router.post("/script")
async def generate_script(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="JSON object expected")
    product = " ".join(str(data.get("product") or "").split())[:800]
    if len(product) < 10:
        raise HTTPException(status_code=400, detail="Describe the product in at least a sentence")
    tone = " ".join(str(data.get("tone") or "").split())[:60]
    _check_script_rate(user_id)
    return await _generate_copy(product, tone)


# ---- Video prompts for Flow / Veo, one per approved creative (BETA) ---------------
VIDEO_PROMPT_MAX_ITEMS = 6

VIDEO_PROMPT_SYSTEM = """You write text-to-video prompts for Google Flow / Veo, to produce short vertical (9:16) ad clips of about 8 seconds.
You receive numbered ads. Each has a hook, a body and a call to action, written in Brazilian Portuguese, and a niche.
For EACH ad write ONE prompt in English, in the same order, 350-600 characters, in this style:
- UGC style, filmed on a phone, natural light, a single scene. Describe the person or product, the setting, the action, the camera movement and the mood.
- Put the hook as the spoken line, in Portuguese, in quotes, said to camera by the person. Keep it word for word.
- No on-screen text, no logos, no brand names, no celebrities or real people, no children, no medical or before/after claims, no violence.
- Do not invent product details that were not given.
Return exactly one prompt per ad."""


class _VideoPrompts(BaseModel):
    prompts: list[str] = Field(description="One English text-to-video prompt per ad, in the same order")


async def _generate_video_prompts(items: list[dict[str, str]], model: Any = None) -> list[str]:
    from pydantic_ai import Agent

    if model is None:
        from ...ai import _build_transcript_model, _get_missing_llm_key_error
        from ...runtime_settings import apply_settings_to_process_env

        runtime_config = get_config()
        apply_settings_to_process_env(runtime_config.as_runtime_settings())
        config_error = _get_missing_llm_key_error(runtime_config.llm, runtime_config)
        if config_error:
            logger.error("multiplier video prompts: %s", config_error)
            raise HTTPException(status_code=503, detail="AI is not configured right now")
        model = _build_transcript_model(runtime_config)

    agent = Agent(model, output_type=_VideoPrompts, system_prompt=VIDEO_PROMPT_SYSTEM, output_retries=2)
    lines = [
        f"{number}. Niche: {item['niche']}\n   Hook: {item['hook']}\n   Body: {item['body']}\n   CTA: {item['cta']}"
        for number, item in enumerate(items, start=1)
    ]
    try:
        result = await asyncio.wait_for(agent.run("\n\n".join(lines)), timeout=90)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI took too long. Try again.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("multiplier video prompts failed")
        raise HTTPException(status_code=502, detail="Could not generate the texts. Try again.")
    prompts = [_clip(value, 900) for value in result.output.prompts if value.strip()]
    if len(prompts) < len(items):
        raise HTTPException(status_code=502, detail="Could not generate the texts. Try again.")
    return prompts[: len(items)]


@router.post("/video-prompts")
async def video_prompts(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    raw_items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(raw_items, list) or not raw_items:
        raise HTTPException(status_code=400, detail="Describe the product in at least a sentence")
    items: list[dict[str, str]] = []
    for raw in raw_items[:VIDEO_PROMPT_MAX_ITEMS]:
        if not isinstance(raw, dict):
            continue
        item = {
            "niche": _clip(raw.get("niche") or "General", 60),
            "hook": _clip(raw.get("hook") or "", 200),
            "body": _clip(raw.get("body") or "", 400),
            "cta": _clip(raw.get("cta") or "", 120),
        }
        if item["hook"]:
            items.append(item)
    if not items:
        raise HTTPException(status_code=400, detail="Describe the product in at least a sentence")
    _check_script_rate(user_id)
    return {"prompts": await _generate_video_prompts(items)}
