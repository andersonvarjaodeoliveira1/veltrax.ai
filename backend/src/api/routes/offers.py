"""Ofertas: o produto que a pessoa vende, com a copy aprovada, a palavra-chave e as referências.

Serve para não começar do zero a cada vídeo: o assistente carrega a oferta e preenche o resto.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from .multiplier import _user_id

router = APIRouter(prefix="/multiplier/offers", tags=["offers"])

MAX_OFFERS = 50
FIELDS = {
    "name": 120,
    "product": 200,
    "keyword": 30,
    "language": 10,
    "approved_copy": 6000,
    "notes": 1500,
    "reference_url": 500,
    "dm_message": 900,
}
COLUMNS = ", ".join(["id", *FIELDS, "created_at", "updated_at"])


COHERENCE_CHECKS_PER_HOUR = 30
_coherence_calls: dict[str, list[float]] = {}


def _check_coherence_rate(user_id: str) -> None:
    """Cada conferência abre uma página de fora: limite por conta, separado do limite da IA."""
    import time

    now = time.time()
    recent = [stamp for stamp in _coherence_calls.get(user_id, []) if now - stamp < 3600]
    if len(recent) >= COHERENCE_CHECKS_PER_HOUR:
        raise HTTPException(status_code=429, detail="Muitas conferências seguidas. Tente de novo daqui a pouco.")
    recent.append(now)
    _coherence_calls[user_id] = recent


def _clean(data: Any) -> dict[str, str]:
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Corpo inválido")
    out = {key: str(data.get(key) or "").strip()[:limit] for key, limit in FIELDS.items()}
    if not out["name"]:
        raise HTTPException(status_code=400, detail="Dê um nome para a oferta")
    out["keyword"] = out["keyword"].upper()
    out["language"] = out["language"] or "pt-BR"
    return out


def _row(row: Any) -> dict[str, Any]:
    item = dict(row._mapping)
    for key in ("created_at", "updated_at"):
        item[key] = item[key].isoformat() if item.get(key) else None
    return item


@router.get("")
async def list_offers(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    rows = await db.execute(
        text(f"SELECT {COLUMNS} FROM offers WHERE user_id = :u ORDER BY updated_at DESC LIMIT :n"),
        {"u": user_id, "n": MAX_OFFERS},
    )
    return {"offers": [_row(r) for r in rows]}


@router.post("")
async def create_offer(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    values = _clean(await request.json())
    total = (await db.execute(text("SELECT COUNT(*) FROM offers WHERE user_id = :u"), {"u": user_id})).scalar() or 0
    if total >= MAX_OFFERS:
        raise HTTPException(status_code=409, detail=f"Você já tem {MAX_OFFERS} ofertas. Apague alguma para criar outra.")
    offer_id = str(uuid.uuid4())
    await db.execute(
        text(
            "INSERT INTO offers (id, user_id, name, product, keyword, language, approved_copy, notes, reference_url, dm_message) "
            "VALUES (:id, :u, :name, :product, :keyword, :language, :approved_copy, :notes, :reference_url, :dm_message)"
        ),
        {"id": offer_id, "u": user_id, **values},
    )
    await db.commit()
    return {"id": offer_id}


@router.post("/coherence")
async def offer_coherence(request: Request, db: AsyncSession = Depends(get_db)):
    """Confere se a página do link da mensagem fala do mesmo assunto do anúncio. Só avisa; não salva nem bloqueia."""
    user_id = await _user_id(request, db)
    data = await request.json()
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Corpo inválido")
    product = str(data.get("product") or "").strip()[: FIELDS["product"]]
    copy = str(data.get("approved_copy") or "").strip()[: FIELDS["approved_copy"]]
    message = str(data.get("dm_message") or "").strip()[: FIELDS["dm_message"]]
    if not (product or copy):
        raise HTTPException(status_code=400, detail="Preencha o produto ou a copy para comparar com a página")
    from ...landing_check import check

    _check_coherence_rate(user_id)
    return await check(product, copy, message)


@router.put("/{offer_id}")
async def update_offer(offer_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    values = _clean(await request.json())
    result = await db.execute(
        text(
            "UPDATE offers SET name=:name, product=:product, keyword=:keyword, language=:language, "
            "approved_copy=:approved_copy, notes=:notes, reference_url=:reference_url, dm_message=:dm_message, updated_at=CURRENT_TIMESTAMP "
            "WHERE id=:id AND user_id=:u"
        ),
        {"id": offer_id, "u": user_id, **values},
    )
    await db.commit()
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Oferta não encontrada")
    return {"ok": True}


@router.delete("/{offer_id}")
async def delete_offer(offer_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    result = await db.execute(text("DELETE FROM offers WHERE id=:id AND user_id=:u"), {"id": offer_id, "u": user_id})
    await db.commit()
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Oferta não encontrada")
    return {"ok": True}
