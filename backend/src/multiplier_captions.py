"""Captions for the Multiplier (BETA): transcribe, group into editable lines, build ASS."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MAX_LINES = 400
MAX_LINE_CHARS = 200
MAX_WORDS_PER_LINE = 6
LINE_GAP_SECONDS = 0.8


def transcribe_words(video_path: Path) -> list[dict[str, Any]]:
    """Transcribe a video and return words as [{text, start, end}] in seconds."""
    from .media.transcription import get_video_transcript, load_cached_transcript_data

    get_video_transcript(video_path)
    data = load_cached_transcript_data(video_path) or {}
    words: list[dict[str, Any]] = []
    for item in data.get("words") or []:
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        start = float(item.get("start", 0)) / 1000.0
        end = float(item.get("end", 0)) / 1000.0
        if end <= start:
            end = start + 0.05
        words.append({"text": text, "start": start, "end": end, "confidence": item.get("confidence", 1.0)})
    return words


def lines_from_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group words into short caption lines the user can edit."""
    lines: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []

    def flush() -> None:
        if current:
            lines.append(
                {
                    "text": " ".join(str(w["text"]) for w in current),
                    "start": round(float(current[0]["start"]), 3),
                    "end": round(float(current[-1]["end"]), 3),
                }
            )
            current.clear()

    for word in words:
        if current and float(word["start"]) - float(current[-1]["end"]) > LINE_GAP_SECONDS:
            flush()
        current.append(word)
        text = str(word["text"])
        if len(current) >= MAX_WORDS_PER_LINE or text.endswith((".", "?", "!")):
            flush()
    flush()
    return lines[:MAX_LINES]


def words_from_lines(lines: Any) -> list[dict[str, Any]]:
    """Turn (possibly edited) lines back into timed words, spreading words evenly in each line."""
    if not isinstance(lines, list):
        return []
    words: list[dict[str, Any]] = []
    last_end = 0.0
    for line in lines[:MAX_LINES]:
        if not isinstance(line, dict):
            continue
        tokens = str(line.get("text", ""))[:MAX_LINE_CHARS].split()
        if not tokens:
            continue
        try:
            start = max(0.0, float(line.get("start", last_end)))
            end = float(line.get("end", start + 0.3 * len(tokens)))
        except (TypeError, ValueError):
            continue
        start = max(start, last_end)
        end = max(end, start + 0.12 * len(tokens))
        step = (end - start) / len(tokens)
        for index, token in enumerate(tokens):
            words.append(
                {
                    "text": token,
                    "start": start + index * step,
                    "end": start + (index + 1) * step,
                    "confidence": 1.0,
                }
            )
        last_end = end
    return words


def shift_words(words: list[dict[str, Any]], skip: float) -> list[dict[str, Any]]:
    """Words for a variation that starts `skip` seconds into the source."""
    if not skip:
        return list(words)
    shifted: list[dict[str, Any]] = []
    for word in words:
        end = float(word["end"]) - skip
        if end <= 0:
            continue
        shifted.append({**word, "start": max(0.0, float(word["start"]) - skip), "end": end})
    return shifted


def build_ass(
    words: list[dict[str, Any]], width: int, height: int, ass_path: Path, template: str = "default"
) -> tuple[bool, Path | None]:
    """Write the ASS file for `words`. Returns (written, fonts_dir)."""
    from .caption_templates import get_template
    from .media.captions import ass_fonts_dir, build_assemblyai_ass_subtitles

    if not words:
        return False, None
    duration = float(words[-1]["end"]) + 0.5
    ok = build_assemblyai_ass_subtitles(
        ass_path,  # video_path is only used for the transcript cache; words are passed in
        clip_start=0.0,
        clip_end=duration,
        video_width=width,
        video_height=height,
        output_ass_path=ass_path,
        caption_template=template,
        caption_words=words,
        position_y_override=0.72,
    )
    if not ok:
        return False, None
    return True, ass_fonts_dir(get_template(template)["font_family"])
