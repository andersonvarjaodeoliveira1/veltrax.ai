"""Vídeo final (BETA): junta as cenas do Flow, põe legenda e título e entrega um MP4 pronto."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

ASPECTS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
MIN_SPEED, MAX_SPEED = 1.0, 1.3
SILENCE_MODES = {
    # pausa mínima (s) que já é cortada, e quanto dela sobra no vídeo (s)
    "light": (0.7, 0.35),
    "strong": (0.35, 0.16),
}
TRANSITIONS = {"fade": "fade", "slide": "slideleft", "dissolve": "dissolve"}
TRANSITION_SECONDS = 0.4
EDGE_PAD = 0.12  # folga antes da primeira e depois da última palavra


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
        "silence": str(raw.get("silence") or "off") if str(raw.get("silence") or "off") in {"off", "light", "strong"} else "off",
        "transition": str(raw.get("transition") or "none") if str(raw.get("transition") or "none") in {"none", "fade", "slide", "dissolve"} else "none",
        "denoise": raw.get("denoise") is True,
    }


def keep_ranges(words: list[dict[str, Any]], duration: float, mode: str) -> list[tuple[float, float]]:
    """Trechos do vídeo que ficam: tira o silêncio do começo e do fim e encurta as pausas longas, sem cortar palavras."""
    if mode not in SILENCE_MODES or not words:
        return [(0.0, duration)]
    threshold, kept = SILENCE_MODES[mode]
    side = kept / 2
    ordered = sorted(words, key=lambda w: float(w["start"]))
    ranges: list[tuple[float, float]] = []
    start = max(0.0, float(ordered[0]["start"]) - EDGE_PAD)
    end = float(ordered[0]["end"])
    for word in ordered[1:]:
        ws, we = float(word["start"]), float(word["end"])
        if ws - end > threshold:
            ranges.append((start, min(duration, end + side)))
            start = max(0.0, ws - side)
        end = max(end, we)
    ranges.append((start, min(duration, end + EDGE_PAD)))
    return [(a, b) for a, b in ranges if b - a > 0.05]


def remap_words(words: list[dict[str, Any]], ranges: list[tuple[float, float]]) -> list[dict[str, Any]]:
    """Tempos das palavras no vídeo já cortado."""
    out: list[dict[str, Any]] = []
    # offset de cada trecho = início original menos o tempo já mantido antes dele
    kept = 0.0
    spans = []
    for a, b in ranges:
        spans.append((a, b, a - kept))
        kept += b - a
    for word in words:
        mid = (float(word["start"]) + float(word["end"])) / 2
        for a, b, offset in spans:
            if a <= mid <= b:
                start = max(a, float(word["start"])) - offset
                end = min(b, float(word["end"])) - offset
                out.append({**word, "start": max(0.0, start), "end": max(start + 0.05, end)})
                break
    return out


def cut_and_clean(source: Path, output: Path, ranges: list[tuple[float, float]], denoise: bool) -> None:
    """Corta os trechos que ficam (com uma emenda curta no áudio) e, se pedido, limpa o ruído."""
    from .api.routes.multiplier import run_ffmpeg_command
    from .media.ffmpeg import h264_encode_args

    graph: list[str] = []
    labels = ""
    for index, (a, b) in enumerate(ranges):
        fade = min(0.01, (b - a) / 4)
        graph.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{index}]")
        graph.append(
            f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={fade:.3f},afade=t=out:st={max(0.0, b - a - fade):.3f}:d={fade:.3f}[a{index}]"
        )
        labels += f"[v{index}][a{index}]"
    tail = ",afftdn=nr=14:nf=-35" if denoise else ""
    graph.append(f"{labels}concat=n={len(ranges)}:v=1:a=1[vc][ac0]")
    graph.append(f"[ac0]anull{tail}[ac]")
    result = run_ffmpeg_command(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source), "-filter_complex", ";".join(graph),
         "-map", "[vc]", "-map", "[ac]", *h264_encode_args(21), "-pix_fmt", "yuv420p", "-profile:v", "high",
         "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", str(output)],
        timeout=900,
    )
    if result.returncode != 0 or not output.exists():
        raise RuntimeError("ffmpeg failed to cut the video")


def join_with_transition(parts: list[Path], output: Path, width: int, height: int, kind: str) -> None:
    """Junta as cenas com uma transição curta (vídeo e áudio) entre cada uma."""
    from .api.routes.multiplier import _scale_chain, run_ffmpeg_command
    from .media.ffmpeg import ffprobe_duration, h264_encode_args

    durations = [float(ffprobe_duration(part)) for part in parts]
    td = max(0.1, min(TRANSITION_SECONDS, min(durations) / 3))
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    graph: list[str] = []
    for index, part in enumerate(parts):
        command += ["-i", str(part)]
        graph.append(_scale_chain(index, width, height))
        graph.append(f"[{index}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a{index}]")
    cur_v, cur_a, acc = "v0", "a0", durations[0]
    for index in range(1, len(parts)):
        graph.append(f"[{cur_v}][v{index}]xfade=transition={TRANSITIONS[kind]}:duration={td:.3f}:offset={acc - td:.3f}[vx{index}]")
        graph.append(f"[{cur_a}][a{index}]acrossfade=d={td:.3f}[ax{index}]")
        cur_v, cur_a, acc = f"vx{index}", f"ax{index}", acc + durations[index] - td
    command += ["-filter_complex", ";".join(graph), "-map", f"[{cur_v}]", "-map", f"[{cur_a}]", *h264_encode_args(21),
                "-pix_fmt", "yuv420p", "-profile:v", "high", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", str(output)]
    result = run_ffmpeg_command(command, timeout=900)
    if result.returncode != 0 or not output.exists():
        raise RuntimeError("ffmpeg failed to join with transitions")


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
    if options["transition"] != "none" and len(prepared) > 1:
        join_with_transition(prepared, joined, width, height, options["transition"])
    else:
        render_combination(prepared, joined, width, height)
    duration = float(ffprobe_duration(joined))

    words: list[dict[str, Any]] = []
    if options["captions"] or options["silence"] != "off":
        progress("Criando a legenda" if options["captions"] else "Lendo a fala")
        try:
            words = transcribe(joined)
        except Exception:
            logger.warning("final video: transcription failed", exc_info=True)
            warning = "Não consegui criar a legenda automática; o vídeo saiu sem ela."
        else:
            if not words:
                warning = "Não encontrei fala no vídeo, então ele saiu sem legenda."

    if (options["silence"] != "off" and words) or options["denoise"]:
        progress("Cortando as pausas" if options["silence"] != "off" and words else "Limpando o áudio")
        ranges = keep_ranges(words, duration, options["silence"]) if options["silence"] != "off" else [(0.0, duration)]
        cut = work / "cut.mp4"
        cut_and_clean(joined, cut, ranges, options["denoise"])
        joined.unlink(missing_ok=True)
        joined = cut
        if words and options["silence"] != "off":
            words = remap_words(words, ranges)
        duration = float(ffprobe_duration(joined))
    elif options["silence"] != "off" and not words:
        warning = (warning + " " if warning else "") + "Sem fala para guiar o corte, então não cortei as pausas."

    if not options["captions"]:
        words = []

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
