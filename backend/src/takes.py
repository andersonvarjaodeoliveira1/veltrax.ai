"""Takes inteligentes de um vídeo orgânico (Veo3/Flow).

A IA (ai.py) escolhe os trechos de maior gancho e retenção na transcrição; aqui a gente
encaixa as bordas de cada trecho nas cenas do Flow, para o corte nunca cair no meio de uma
cena, e devolve takes prontos (com headline) para o agendador de posts já existente.

Fluxo:
    bounds = scene_boundaries(duracoes_das_cenas, transition_seconds=...)
    # se o vídeo final cortou silêncio, remapeie as bordas para o tempo do vídeo cortado:
    bounds = remap_boundaries(bounds, ranges_mantidos)
    takes = await build_takes(transcript, duracoes_das_cenas, ...)

As funções de cálculo são puras (sem rede, sem ffmpeg), para dar para testar sem rodar vídeo.
O corte dos arquivos e o agendamento ficam em quem chama (clip_editor / rota de posts).
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

DEFAULT_MIN_LEN = 8.0   # take curto demais não vira post
DEFAULT_MAX_LEN = 90.0  # teto de um corte vertical


def parse_mmss(value: str | float) -> float:
    """Converte 'MM:SS' ou 'HH:MM:SS' (ou um número) em segundos."""
    if isinstance(value, (int, float)):
        return float(value)
    parts = str(value).strip().split(":")
    if not parts or any(not p.strip().lstrip("-").isdigit() for p in parts):
        return 0.0
    nums = [int(p) for p in parts]
    seconds = 0.0
    for n in nums:
        seconds = seconds * 60 + n
    return float(seconds)


def format_mmss(seconds: float) -> str:
    """Segundos em 'MM:SS' (ou 'HH:MM:SS' quando passa de uma hora)."""
    seconds = max(0, round(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def scene_boundaries(durations: list[float], *, transition_seconds: float = 0.0) -> list[float]:
    """Pontos de corte (em segundos) no vídeo já montado, um por fim de cena.

    Com transição de T segundos entre as cenas, cada junção sobrepõe T, então o fim da
    cena k no tempo do vídeo é soma(duracoes[:k]) - T*(k-1). Devolve [0, fim1, fim2, ..., total],
    estritamente crescente (desde que cada cena seja maior que a transição).
    """
    bounds = [0.0]
    prefix = 0.0
    for k, d in enumerate(durations, start=1):
        prefix += max(0.0, float(d))
        end = prefix - transition_seconds * (k - 1)
        # nunca deixa a borda andar para trás (cena curta demais perto da transição)
        bounds.append(round(max(bounds[-1], end), 3))
    return bounds


def remap_boundaries(bounds: list[float], ranges: list[tuple[float, float]]) -> list[float]:
    """Reposiciona as bordas de cena para o tempo do vídeo depois do corte de silêncio.

    `ranges` são os trechos mantidos (a, b) no tempo original, na ordem. Uma borda que caiu
    dentro de uma pausa removida gruda na beira mantida mais próxima. Mesma conta do remap_words.
    """
    if not ranges:
        return list(bounds)
    spans: list[tuple[float, float, float]] = []
    kept = 0.0
    for a, b in ranges:
        spans.append((a, b, a - kept))  # offset = início original menos o tempo já mantido antes
        kept += b - a
    total_kept = kept
    out: list[float] = []
    for t in bounds:
        if t <= spans[0][0]:
            out.append(0.0)
            continue
        placed = None
        for a, b, offset in spans:
            if a <= t <= b:
                placed = t - offset
                break
            if t < a:  # caiu numa pausa removida: vai para o começo do próximo trecho mantido
                placed = a - offset
                break
        out.append(round(placed if placed is not None else total_kept, 3))
    # mantém crescente e sem duplicatas coladas
    cleaned: list[float] = []
    for t in out:
        if not cleaned or t > cleaned[-1] + 1e-6:
            cleaned.append(t)
    return cleaned


def _snap_down(bounds: list[float], t: float) -> float:
    """Maior borda <= t (início da cena que contém t)."""
    chosen = bounds[0]
    for b in bounds:
        if b <= t + 1e-6:
            chosen = b
        else:
            break
    return chosen


def _snap_up(bounds: list[float], t: float) -> float:
    """Menor borda >= t (fim da cena que contém t)."""
    for b in bounds:
        if b >= t - 1e-6:
            return b
    return bounds[-1]


def plan_takes(
    segments: list[dict[str, Any]],
    bounds: list[float],
    *,
    min_len: float = DEFAULT_MIN_LEN,
    max_len: float = DEFAULT_MAX_LEN,
) -> list[dict[str, Any]]:
    """Encaixa cada trecho da IA nas cenas e devolve os takes finais.

    - A borda inicial desce até o começo da cena; a final sobe até o fim da cena, de modo que
      o take contém o trecho inteiro e corta só em fim de cena.
    - Takes que se sobrepõem (compartilham cena) são resolvidos: fica o de maior nota.
    - Respeita min_len (estende até a próxima cena) e max_len (apara cenas do fim, sem picá-las).
    - Mantém a headline (hook_title) e o texto do trecho.

    `segments`: [{start, end, hook_title, text, score}] com start/end em segundos.
    Retorna [{start, end, hook_title, text, score}] em ordem de tempo.
    """
    if len(bounds) < 2:
        return []
    total = bounds[-1]
    candidates: list[dict[str, Any]] = []
    for seg in segments:
        start = max(0.0, min(float(seg.get("start", 0.0)), total))
        end = max(start, min(float(seg.get("end", 0.0)), total))
        a = _snap_down(bounds, start)
        b = _snap_up(bounds, end)
        if b <= a:
            continue
        # curto demais: estende para a próxima borda, sem passar de max_len
        if b - a < min_len:
            nxt = _snap_up(bounds, a + min_len)
            if nxt - a <= max_len:
                b = nxt
        # comprido demais: apara cenas do fim até caber (sem cortar no meio de cena)
        if b - a > max_len:
            trimmed = a
            for bd in bounds:
                if a < bd <= a + max_len:
                    trimmed = bd
            if trimmed > a:
                b = trimmed
        if b - a < min(min_len, max_len) - 1e-6:
            continue
        candidates.append({
            "start": round(a, 3),
            "end": round(b, 3),
            "hook_title": (seg.get("hook_title") or "").strip() or None,
            "text": seg.get("text") or "",
            "score": float(seg.get("score", 0.0) or 0.0),
        })

    # resolve sobreposições: por nota desc, aceita quem não encosta num já aceito
    candidates.sort(key=lambda c: (-c["score"], c["start"]))
    accepted: list[dict[str, Any]] = []
    for cand in candidates:
        if all(cand["end"] <= acc["start"] + 1e-6 or cand["start"] >= acc["end"] - 1e-6 for acc in accepted):
            accepted.append(cand)
    accepted.sort(key=lambda c: c["start"])
    return accepted


async def build_takes(
    transcript: str,
    durations: list[float],
    *,
    transition_seconds: float = 0.0,
    silence_ranges: list[tuple[float, float]] | None = None,
    min_len: float = DEFAULT_MIN_LEN,
    max_len: float = DEFAULT_MAX_LEN,
    analyze: Callable[[str], Awaitable[Any]] | None = None,
) -> list[dict[str, Any]]:
    """Orquestra: IA escolhe os trechos, e a gente encaixa nas cenas do Flow.

    `transcript` é a transcrição já formatada (linhas 'MM:SS ...'), igual à do pipeline de cortes.
    `durations` são as durações das cenas do pacote, na ordem em que entraram no vídeo.
    `analyze` é injetável para teste; por padrão usa ai.get_most_relevant_parts_by_transcript.
    """
    bounds = scene_boundaries(durations, transition_seconds=transition_seconds)
    if silence_ranges:
        bounds = remap_boundaries(bounds, silence_ranges)
    if len(bounds) < 2:
        return []

    if analyze is None:
        from .ai import (
            get_most_relevant_parts_by_transcript as analyze,  # import tardio (dependências pesadas)
        )

    analysis = await analyze(transcript)
    raw = getattr(analysis, "most_relevant_segments", None)
    if raw is None and isinstance(analysis, dict):
        raw = analysis.get("most_relevant_segments")
    segments: list[dict[str, Any]] = []
    for seg in raw or []:
        get = seg.get if isinstance(seg, dict) else lambda k, d=None, s=seg: getattr(s, k, d)
        segments.append({
            "start": parse_mmss(get("start_time", 0)),
            "end": parse_mmss(get("end_time", 0)),
            "hook_title": get("hook_title", None),
            "text": get("text", "") or "",
            "score": float(get("relevance_score", 0.0) or 0.0),
        })
    return plan_takes(segments, bounds, min_len=min_len, max_len=max_len)
