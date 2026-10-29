"""Rotas da ponte com a conta de IA da pessoa (ver ai_relay.py). Usadas pela página do ClipGringa e pela extensão."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ... import ai_relay
from ...database import get_db
from .multiplier import _user_id

router = APIRouter(prefix="/multiplier/ai-relay", tags=["ai-relay"])


async def _body(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="JSON object expected")
    return data


def _site(data: dict) -> str:
    site = str(data.get("site") or "")
    if site not in ai_relay.SITES:
        raise HTTPException(status_code=400, detail="Unknown AI site")
    return site


@router.post("/poll")
async def poll(request: Request, db: AsyncSession = Depends(get_db)):
    """Busca o próximo pedido de texto (espera até ~20 s). Também avisa que a conta está ligada."""
    user_id = await _user_id(request, db)
    data = await _body(request)
    job = await ai_relay.poll(user_id, _site(data), float(data.get("wait") or 20))
    return {"job": job}


@router.post("/result")
async def result(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    data = await _body(request)
    ok = ai_relay.submit_result(user_id, str(data.get("id") or ""), str(data.get("text") or "")[:60000], str(data.get("error") or ""))
    return {"ok": ok}


@router.get("/status")
async def status(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    site = ai_relay.ready_site(user_id)
    return {"ready": bool(site), "site": site}


@router.post("/off")
async def off(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    ai_relay.disconnect(user_id)
    return {"ok": True}
