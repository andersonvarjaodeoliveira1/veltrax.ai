"""ClipSpy — radar de criativos vencedores (Fase 1: Meta Ad Library).

Busca anúncios ativos por termo, persiste no banco de criativos (creative_bank)
e serve a biblioteca para a tela de criação modelar os vencedores.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...clipspy import search_ad_library
from ...database import get_db
from .multiplier import _user_id

router = APIRouter(prefix="/clipspy", tags=["clipspy"])

# A UE tem cobertura comercial completa na Ad Library (DSA); por isso o default.
DEFAULT_COUNTRIES = ["DE", "FR", "IT", "ES", "NL", "PT"]
MAX_LIMIT = 50


def _row(r: Any) -> dict[str, Any]:
    try:
        metrics = json.loads(r.metrics) if r.metrics else {}
    except (ValueError, TypeError):
        metrics = {}
    return {
        "id": r.id,
        "source": r.source,
        "external_id": r.external_id,
        "advertiser": r.advertiser or "",
        "title": r.title or "",
        "permalink": r.permalink or "",
        "thumbnail": r.thumbnail or "",
        "metrics": metrics,
        "score": float(r.score or 0),
        "is_champion": bool(r.is_champion),
        "term": r.term or "",
        "status": r.status,
    }


@router.post("/search")
async def search(request: Request, db: AsyncSession = Depends(get_db)):
    """Minera a Ad Library por um termo, salva no banco e devolve ordenado por tempo de veiculação."""
    user_id = await _user_id(request, db)
    body = await request.json()
    term = str(body.get("term") or "").strip()
    if len(term) < 2:
        raise HTTPException(status_code=400, detail="Digite um termo de busca")
    countries = body.get("countries") or DEFAULT_COUNTRIES
    if not isinstance(countries, list) or not countries:
        countries = DEFAULT_COUNTRIES
    limit = min(int(body.get("limit") or 30), MAX_LIMIT)
    try:
        ads = await search_ad_library(term, [str(c) for c in countries], limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    results: list[dict[str, Any]] = []
    for ad in ads:
        if not ad["external_id"]:
            continue
        row = (await db.execute(text(
            """
            INSERT INTO creative_bank
              (id, user_id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status)
            VALUES
              (:id, :u, :src, :ext, :adv, :title, :link, :thumb, :metrics, :score, :champ, :term, 'novo')
            ON CONFLICT (user_id, source, external_id) DO UPDATE SET
              advertiser = EXCLUDED.advertiser, title = EXCLUDED.title, permalink = EXCLUDED.permalink,
              metrics = EXCLUDED.metrics, score = EXCLUDED.score, is_champion = EXCLUDED.is_champion, term = EXCLUDED.term
            RETURNING id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status
            """
        ), {
            "id": str(uuid.uuid4()), "u": user_id, "src": ad["source"], "ext": ad["external_id"],
            "adv": ad["advertiser"], "title": ad["title"], "link": ad["permalink"], "thumb": ad["thumbnail"],
            "metrics": json.dumps(ad["metrics"]), "score": ad["score"], "champ": ad["is_champion"], "term": term,
        })).first()
        if row:
            results.append(_row(row))
    await db.commit()
    return {"results": results, "count": len(results)}


@router.get("/bank")
async def bank(request: Request, champion: int = 0, source: str = "", db: AsyncSession = Depends(get_db)):
    """Lista a biblioteca de criativos salva (opcionalmente só os campeões)."""
    user_id = await _user_id(request, db)
    clauses = ["user_id = :u", "status <> 'arquivado'"]
    params: dict[str, Any] = {"u": user_id}
    if champion:
        clauses.append("is_champion = TRUE")
    if source:
        clauses.append("source = :src")
        params["src"] = source
    rows = (await db.execute(text(
        f"SELECT id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status "
        f"FROM creative_bank WHERE {' AND '.join(clauses)} ORDER BY is_champion DESC, score DESC, discovered_at DESC LIMIT 200"
    ), params)).all()
    return {"items": [_row(r) for r in rows]}


@router.post("/bank/{item_id}/status")
async def set_status(item_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Marca um criativo como salvo, usado ou arquivado."""
    user_id = await _user_id(request, db)
    status = str((await request.json()).get("status") or "").strip()
    if status not in {"novo", "salvo", "usado", "arquivado"}:
        raise HTTPException(status_code=400, detail="Status inválido")
    result = await db.execute(text(
        "UPDATE creative_bank SET status = :s WHERE id = :id AND user_id = :u"
    ), {"s": status, "id": item_id, "u": user_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Criativo não encontrado")
    await db.commit()
    return {"ok": True, "status": status}
