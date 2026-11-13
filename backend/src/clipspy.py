"""ClipSpy — radar de criativos vencedores por APIs oficiais.

Fase 1: Meta Ad Library (anúncios ativos, ordenados por tempo de veiculação —
anúncio antigo e ainda rodando = provável vencedor/lucrativo). Sem scraping.

A Ad Library API entrega criativo, página e datas, mas NÃO engajamento por
anúncio; por isso o "campeão" no Facebook é por longevidade. YouTube/TikTok
(engajamento real) entram nas fases seguintes.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx

GRAPH = os.getenv("META_GRAPH_URL", "https://graph.facebook.com").rstrip("/")
GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v21.0")
# Dias de veiculação para marcar "Vídeo Campeão" no Facebook (longevidade = lucro).
CHAMPION_MIN_DAYS = int(os.getenv("CLIPSPY_CHAMPION_MIN_DAYS", "14"))


def adlib_token() -> str | None:
    return (os.getenv("META_ADLIB_TOKEN") or "").strip() or None


def _graph_error(body: dict[str, Any], status: int) -> str:
    err = (body or {}).get("error") or {}
    msg = err.get("message") or f"Erro {status} na Ad Library"
    return str(msg)


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    raw = str(value)
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


async def search_ad_library(
    term: str,
    countries: list[str],
    *,
    limit: int = 30,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    """Busca anúncios ATIVOS na Ad Library e devolve ordenado por tempo de veiculação."""
    token = adlib_token()
    if not token:
        raise ValueError(
            "Ad Library não configurada: defina META_ADLIB_TOKEN no servidor para buscar anúncios."
        )
    own = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(45, connect=20))
    try:
        params = {
            "access_token": token,
            "search_terms": term,
            "ad_type": "ALL",
            "ad_active_status": "ACTIVE",
            "ad_reached_countries": json.dumps([c.upper() for c in countries if c.strip()]),
            "fields": "id,page_name,ad_delivery_start_time,ad_creative_bodies,ad_snapshot_url",
            "limit": str(max(1, min(limit, 100))),
        }
        r = await client.get(f"{GRAPH}/{GRAPH_VERSION}/ads_archive", params=params)
        body = r.json() if r.content else {}
        if r.status_code >= 400 or "error" in body:
            raise ValueError(_graph_error(body, r.status_code))
        now = datetime.now(timezone.utc)
        out: list[dict[str, Any]] = []
        for ad in body.get("data", []):
            start = _parse_time(ad.get("ad_delivery_start_time"))
            run_days = (now - start).days if start else 0
            bodies = ad.get("ad_creative_bodies") or []
            out.append(
                {
                    "source": "meta_adlib",
                    "external_id": str(ad.get("id") or ""),
                    "advertiser": str(ad.get("page_name") or ""),
                    "title": (bodies[0] if bodies else "")[:300],
                    "permalink": str(ad.get("ad_snapshot_url") or ""),
                    "thumbnail": "",
                    "metrics": {"run_days": run_days},
                    "score": float(run_days),
                    "is_champion": run_days >= CHAMPION_MIN_DAYS,
                }
            )
        out.sort(key=lambda x: x["metrics"]["run_days"], reverse=True)
        return out
    finally:
        if own:
            await client.aclose()
