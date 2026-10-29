"""Minhas APIs: cada usuário conecta as próprias chaves."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import get_authenticated_user_id
from ...config import get_config
from ...database import get_db
from ...integrations import DEFAULT_OLLAMA_URL, PROVIDERS, check_key, delete_integration, list_integrations, ollama_probe, pack_ollama, pick_ollama_model, save_integration

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
    hint: str | None = None
    if provider == "ollama":
        import re
        from urllib.parse import urlparse

        url = str((data or {}).get("url") or "").strip() or DEFAULT_OLLAMA_URL
        model = str((data or {}).get("model") or "").strip()
        if len(value) > 400 or any(c.isspace() for c in value):
            raise HTTPException(status_code=400, detail="Cole a chave inteira, sem espaços.")
        if not value and url.rstrip("/") == DEFAULT_OLLAMA_URL:
            raise HTTPException(status_code=400, detail="O Ollama Cloud precisa de uma chave (ollama.com/settings/keys).")
        if model and not re.fullmatch(r"[A-Za-z0-9._:/-]{1,80}", model):
            raise HTTPException(status_code=400, detail="O nome do modelo tem caracteres que não são aceitos.")
        ok, reason, models = await ollama_probe(url, value)
        if not ok:
            raise HTTPException(status_code=400, detail=reason)
        model = model or pick_ollama_model(models)
        if not model:
            raise HTTPException(status_code=400, detail="O Ollama respondeu, mas não listou nenhum modelo. Escreva o nome do modelo (ex.: gpt-oss:120b).")
        hint = f"{model} · {urlparse(url).hostname}"[:120]
        value = pack_ollama(value, url, model)
    else:
        if len(value) < 8 or len(value) > 400 or any(c.isspace() for c in value):
            raise HTTPException(status_code=400, detail="Cole a chave inteira, sem espaços.")
        ok, reason = await check_key(provider, value)
        if not ok:
            raise HTTPException(status_code=400, detail=reason)
    await save_integration(db, user_id, provider, value, hint)
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

    user_id = _uid(request)
    balance = await get_balance(db, user_id)
    # Chave própria de IA conectada (Gemini/Flow, Claude ou ChatGPT): a pessoa usa a dela e não depende dos tokens.
    rows = (await db.execute(text("SELECT 1 FROM user_integrations WHERE user_id = :u AND provider IN ('gemini','flow','anthropic','openai','openrouter','huggingface','ollama') LIMIT 1"), {"u": user_id})).first()
    return {**balance, "own_key": rows is not None}


@usage_router.get("/test-status")
async def my_test_status(request: Request, db: AsyncSession = Depends(get_db)):
    """Se a conta é de teste, devolve até quando ela fica ativa (para o aviso dentro do aplicativo)."""
    row = (await db.execute(text("SELECT test_expires_at FROM users WHERE id = :u AND is_admin = FALSE"), {"u": _uid(request)})).first()
    expires = row[0] if row else None
    return {"test_expires_at": expires.isoformat() if expires else None}


flow_router = APIRouter(prefix="/flow", tags=["flow"])


class FlowStatus(BaseModel):
    connected: bool
    plan: str | None = Field(default=None, max_length=40)
    credits: int | None = Field(default=None, ge=0, le=10_000_000)


@flow_router.post("/status")
async def save_flow_status(body: FlowStatus, request: Request, db: AsyncSession = Depends(get_db)):
    """A extensão avisa (pelo site) se a conta do Flow do membro está conectada. Só guarda plano e saldo lidos na tela."""
    user_id = _uid(request)
    await db.execute(
        text(
            """
            INSERT INTO flow_connection (user_id, connected, plan, credits, connected_since, disconnected_at, checked_at)
            VALUES (:u, :c, :p, :k, CASE WHEN :c THEN now() END, CASE WHEN :c THEN NULL ELSE now() END, now())
            ON CONFLICT (user_id) DO UPDATE SET
                connected_since = CASE WHEN :c AND NOT flow_connection.connected THEN now()
                                       WHEN :c THEN flow_connection.connected_since ELSE flow_connection.connected_since END,
                disconnected_at = CASE WHEN NOT :c AND flow_connection.connected THEN now()
                                       WHEN :c THEN NULL ELSE flow_connection.disconnected_at END,
                connected = :c,
                plan = CASE WHEN :c THEN COALESCE(:p, flow_connection.plan) ELSE flow_connection.plan END,
                credits = CASE WHEN :c THEN COALESCE(:k, flow_connection.credits) ELSE flow_connection.credits END,
                checked_at = now()
            """
        ),
        {"u": user_id, "c": body.connected, "p": body.plan, "k": body.credits},
    )
    await db.commit()
    return {"ok": True}
