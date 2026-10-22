"""Minhas APIs: cada usuário conecta as próprias chaves."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import get_authenticated_user_id
from ...config import get_config
from ...database import get_db
from ...integrations import PROVIDERS, check_key, delete_integration, list_integrations, save_integration

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _uid(request: Request) -> str:
    return get_authenticated_user_id(request, get_config())


@router.get("/")
async def list_all(request: Request, db: AsyncSession = Depends(get_db)):
    return {"integrations": await list_integrations(db, _uid(request))}


@router.put("/{provider}")
async def connect(provider: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = _uid(request)
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Provedor desconhecido")
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Corpo inválido")
    value = str((data or {}).get("key") or "").strip()
    if len(value) < 8 or len(value) > 400 or any(c.isspace() for c in value):
        raise HTTPException(status_code=400, detail="Cole a chave inteira, sem espaços.")
    ok, reason = await check_key(provider, value)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    await save_integration(db, user_id, provider, value)
    return {"integrations": await list_integrations(db, user_id)}


@router.delete("/{provider}")
async def disconnect(provider: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = _uid(request)
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Provedor desconhecido")
    await delete_integration(db, user_id, provider)
    return {"integrations": await list_integrations(db, user_id)}


usage_router = APIRouter(prefix="/usage", tags=["usage"])


@usage_router.get("/me")
async def my_balance(request: Request, db: AsyncSession = Depends(get_db)):
    from ...usage import get_balance

    return await get_balance(db, _uid(request))
