"""Leitura da página: acha o vídeo que se destacou e diz o próximo passo.

A regra é a do método "espalhar, achar, encher": enquanto nenhum vídeo se destaca da
média da página, testa formatos diferentes; quando um se destaca, para de abrir formato
novo e repete aquele com variações (pessoa, roupa, ambiente), sempre com arquivo novo.
"""
from __future__ import annotations

from statistics import median
from typing import Any

WINDOW = 30  # vídeos mais recentes que entram na conta
RECENT = 10  # um destaque só manda no próximo passo enquanto está entre os últimos
MIN_VIDEOS = 5
BASE_FLOOR = 50  # página no zero: evita chamar 30 views de destaque
SIGNAL_TIMES, SIGNAL_VIEWS = 3, 300
VIRAL_TIMES, VIRAL_VIEWS = 10, 3000

COUNTRY_ALIASES = {"UK": "GB", "EUA": "US", "USA": "US"}
TIER_ONE = ("US", "CA", "GB", "AU", "NZ")


def parse_countries(value: Any) -> list[str]:
    """Códigos de país de 2 letras, sem repetir, no máximo 25. Aceita vírgula, espaço ou lista."""
    parts = value if isinstance(value, (list, tuple)) else str(value or "").replace(";", ",").replace(" ", ",").split(",")
    out: list[str] = []
    for part in parts:
        code = COUNTRY_ALIASES.get(str(part).strip().upper(), str(part).strip().upper())
        if len(code) == 2 and code.isalpha() and code not in out:
            out.append(code)
    return out[:25]


def _tag(views: int, base: float) -> str:
    times = views / base
    if times >= VIRAL_TIMES and views >= VIRAL_VIEWS:
        return "viral"
    if times >= SIGNAL_TIMES and views >= SIGNAL_VIEWS:
        return "sinal"
    return ""


def read_page(videos: list[dict[str, Any]]) -> dict[str, Any]:
    """`videos`: dicionários com id, title, link, published_at (datetime ou None) e views."""
    ordered = sorted(videos, key=lambda v: (v.get("published_at") is not None, v.get("published_at")), reverse=True)[:WINDOW]
    if len(ordered) < MIN_VIDEOS:
        return {"status": "poucos", "base": 0, "total": len(ordered), "videos": [_item(v, 0, "") for v in ordered],
                "message": "Ainda são poucos vídeos para ler a página.",
                "next": f"Poste formatos diferentes, 1 ou 2 de cada, até ter pelo menos {MIN_VIDEOS} vídeos publicados."}
    base = max(float(median(int(v.get("views") or 0) for v in ordered)), float(BASE_FLOOR))
    items = [_item(v, base, _tag(int(v.get("views") or 0), base)) for v in ordered]
    recent = items[:RECENT]
    lead_index = next((i for i, v in enumerate(recent) if v["tag"]), None)
    out: dict[str, Any] = {"base": int(round(base)), "total": len(items), "videos": items}
    if lead_index is None:
        older = any(v["tag"] for v in items[RECENT:])
        return {**out, "status": "espalhar",
                "message": "Nenhum vídeo recente se destacou da média da página." + (" O último destaque já ficou para trás." if older else ""),
                "next": "Continue testando formatos diferentes, 1 ou 2 de cada. Não julgue um formato por um vídeo só."}
    lead = max((v for v in recent if v["tag"]), key=lambda v: v["views"])
    after = recent[:lead_index]  # o que foi publicado depois do destaque mais recente
    if len(after) >= 3 and all(v["times"] < 1 for v in after):
        return {**out, "status": "espalhar", "lead": lead,
                "message": f"O destaque esfriou: os {len(after)} vídeos depois dele ficaram abaixo da média.",
                "next": "Volte a testar formatos diferentes. Se quiser insistir, troque a parte que muda o formato, não só a pessoa."}
    return {**out, "status": "encher", "lead": lead,
            "message": f"Um formato se destacou: {lead['times']:.0f} vezes a média da página.".replace(".0 ", " "),
            "next": "Pare de abrir formato novo. Repita este com o mesmo texto e troque uma coisa por vez: pessoa, roupa ou ambiente. Arquivo novo em cada post."}


def _item(v: dict[str, Any], base: float, tag: str) -> dict[str, Any]:
    views = int(v.get("views") or 0)
    when = v.get("published_at")
    return {"id": str(v.get("id") or ""), "title": str(v.get("title") or ""), "link": str(v.get("link") or ""),
            "published_at": when.isoformat() if hasattr(when, "isoformat") else when,
            "views": views, "times": round(views / base, 1) if base else 0.0, "tag": tag}
