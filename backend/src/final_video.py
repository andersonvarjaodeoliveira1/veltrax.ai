"""Vídeo final (BETA): junta as cenas do Flow, põe legenda e título e entrega um MP4 pronto."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

ASPECTS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
MIN_SPEED, MAX_SPEED = 1.0, 1.3


def clean_options(raw: dict[str, Any]) -> dict[str, Any]:
    """Valida o que a pessoa escolheu; o que vier inválido volta ao padrão."""
    from .caption_templates import get_template_names

    aspect = str(raw.get("aspect") or "9:16")
    template = str(raw.get("template") or "default")
    try:
        speed = float(raw.get("speed") or 1.0)
    except (TypeError, ValueError):
        speed = 1.0
    return {
        "aspect": aspect if aspect in ASPECTS else "9:16",
        "template": template if template in get_template_names() else "default",
        "title": " ".join(str(raw.get("title") or "").split())[:90],
        "speed": max(MIN_SPEED, min(MAX_SPEED, speed)),
        "captions": raw.get("captions") is not False,
    }


def build_final_ass(words: list[dict[str, Any]], title: str, width: int, height: int, ass_path: Path, template: str, duration: float) -> tuple[bool, Path | None]:
    """ASS com a legenda por palavra e/ou o título nos primeiros segundos. Devolve (escrito, pasta das fontes)."""
    from .caption_templates import get_template
    from .media.captions import ass_fonts_dir, build_assemblyai_ass_subtitles

    if not words and not title:
        return False, None
    ok = build_assemblyai_ass_subtitles(
        ass_path,
        clip_start=0.0,
        clip_end=max(duration, (float(words[-1]["end"]) + 0.5) if words else duration),
        video_width=width,
        video_height=height,
        output_ass_path=ass_path,
        caption_template=template,
        caption_words=words,
        hook_title=title or None,
        include_captions=bool(words),
        position_y_override=0.72,
    )
    if not ok:
        return False, None
    return True, ass_fonts_dir(get_template(template)["font_family"])


def render_final(
    parts: list[Path], output: Path, work: Path, options: dict[str, Any],
    transcribe: Callable[[Path], list[dict[str, Any]]],
    progress: Callable[[str], None] = lambda _s: None,
) -> dict[str, Any]:
    """Junta as cenas, transcreve, queima legenda/título e acelera. Devolve {duration, warning}."""
    from .api.routes.multiplier import ensure_audio, render_combination, render_variation
    from .media.ffmpeg import ffprobe_duration

    width, height = ASPECTS[options["aspect"]]
    warning = ""
    progress("Juntando as cenas")
    prepared = [ensure_audio(part) for part in parts]
    joined = work / "joined.mp4"
    render_combination(prepared, joined, width, height)
    duration = float(ffprobe_duration(joined))

    words: list[dict[str, Any]] = []
    if options["captions"]:
        progress("Criando a legenda")
        try:
            words = transcribe(joined)
        except Exception:
            logger.warning("final video: transcription failed", exc_info=True)
            warning = "Não consegui criar a legenda automática; o vídeo saiu sem ela."
        else:
            if not words:
                warning = "Não encontrei fala no vídeo, então ele saiu sem legenda."

    ass_path: Path | None = None
    fonts_dir: Path | None = None
    if words or options["title"]:
        progress("Aplicando legenda e título")
        written, fonts_dir = build_final_ass(words, options["title"], width, height, work / "final.ass", options["template"], duration)
        ass_path = work / "final.ass" if written else None
        if not written and (words or options["title"]):
            warning = (warning + " " if warning else "") + "Não consegui aplicar a legenda/título."

    progress("Gerando o vídeo final")
    if ass_path is None and options["speed"] == 1.0:
        joined.replace(output)
    else:
        render_variation(joined, output, width, height, {"speed": options["speed"]}, False, ass_path=ass_path, fonts_dir=fonts_dir)
        joined.unlink(missing_ok=True)
    return {"duration": float(ffprobe_duration(output)), "warning": warning}
