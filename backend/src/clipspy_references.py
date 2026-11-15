"""Arquivo de referências manual do ClipSpy.

A pessoa acha um vídeo navegando (Reel, vídeo de página, YouTube, TikTok), cola o link e anota
o que viu: o texto do vídeo, a página e os números. Nada é buscado no link pelo servidor: o que
entra na biblioteca é só o que a pessoa digitou.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any
from urllib.parse import parse_qs, urlparse

SOURCE = "manual"
# Parâmetros que identificam o vídeo em links do tipo watch?v=...; o resto da query é rastreio.
ID_PARAMS = ("v", "story_fbid", "fbid", "id")
MULTIPLIERS = (("milhões", 1_000_000), ("milhão", 1_000_000), ("milhoes", 1_000_000), ("milhao", 1_000_000),
               ("mil", 1_000), ("mi", 1_000_000), ("k", 1_000), ("m", 1_000_000))


def parse_count(value: Any) -> int | None:
    """Número digitado do jeito que aparece na tela: 224000, 224.000, 224 mil, 1,5 mi, 12k."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return max(0, int(value))
    text = str(value).strip().lower()
    if not text:
        return None
    for suffix, factor in MULTIPLIERS:
        if text.endswith(suffix):
            number = text[: -len(suffix)].strip().replace(",", ".")
            try:
                return max(0, int(round(float(number) * factor)))
            except ValueError:
                return None
    digits = re.sub(r"[.,\s]", "", text)
    return int(digits) if digits.isdigit() else None


def link_key(link: str) -> str:
    """Mesmo vídeo, mesma chave: ignora www, m., barra final e parâmetros de rastreio."""
    parsed = urlparse(link.strip())
    host = re.sub(r"^(www|m|web|mbasic)\.", "", parsed.netloc.lower())
    query = parse_qs(parsed.query)
    kept = "&".join(f"{k}={query[k][0]}" for k in ID_PARAMS if query.get(k))
    return f"{host}{parsed.path.rstrip('/')}" + (f"?{kept}" if kept else "")


def manual_reference(body: dict[str, Any]) -> dict[str, Any]:
    """Valida o que a pessoa digitou e devolve a linha da biblioteca. Levanta ValueError com a mensagem para a tela."""
    link = str(body.get("link") or "").strip()
    parsed = urlparse(link)
    if parsed.scheme not in ("http", "https") or "." not in parsed.netloc or len(link) > 600:
        raise ValueError("Cole o link completo do vídeo, começando com https://")
    text = " ".join(str(body.get("text") or "").split())[:2000]
    metrics: dict[str, Any] = {}
    for key in ("views", "comments"):
        raw = body.get(key)
        count = parse_count(raw)
        if count is None and str(raw or "").strip():
            raise ValueError("Escreva os números como aparecem na tela. Ex.: 224 mil, 1.500 ou 12k")
        if count is not None:
            metrics[key] = count
    note = " ".join(str(body.get("note") or "").split())[:300]
    if note:
        metrics["note"] = note
    host = re.sub(r"^(www|m|web|mbasic)\.", "", parsed.netloc.lower())
    return {
        "source": SOURCE,
        "external_id": hashlib.sha256(link_key(link).encode("utf-8")).hexdigest()[:32],
        "advertiser": " ".join(str(body.get("advertiser") or "").split())[:160],
        "title": text,
        "permalink": link,
        "metrics": metrics,
        "score": float(metrics.get("views") or 0),
        "is_champion": bool(body.get("champion")),
        "term": host[:80],
    }
