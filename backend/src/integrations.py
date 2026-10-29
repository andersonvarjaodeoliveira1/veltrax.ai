"""Chaves de API próprias de cada usuário (Gemini, ChatGPT, Claude, Flow...).

Ficam criptografadas (AES-GCM, a mesma proteção das configurações do admin) e só o
próprio dono as usa: nunca voltam para a tela, só os 4 últimos caracteres.
"""
from __future__ import annotations

import contextvars
import logging
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .runtime_settings import decrypt_setting_value, encrypt_setting_value

logger = logging.getLogger(__name__)

# provider -> (nome na tela, como testar a chave)
PROVIDERS: dict[str, dict[str, str]] = {
    "gemini": {"label": "Gemini (Google)", "help": "Tem uma cota grátis limitada (pode acabar no dia). Entre em aistudio.google.com/apikey com a sua conta Google, clique em “Create API key” e cole aqui."},
    "openai": {"label": "ChatGPT (OpenAI)", "help": "Chave da OpenAI (platform.openai.com/api-keys). Atenção: a assinatura do ChatGPT não inclui créditos de API; a API é cobrada à parte (platform.openai.com/settings/organization/billing)."},
    "anthropic": {"label": "Claude (Anthropic)", "help": "Chave da Anthropic (console.anthropic.com)."},
    "openrouter": {"label": "OpenRouter", "help": "Chave do OpenRouter (openrouter.ai/keys)."},
    "ollama": {"label": "Ollama (nuvem ou servidor seu)", "help": "Para o Ollama Cloud: crie a chave em ollama.com/settings/keys e deixe o endereço padrão (https://ollama.com). Se você hospeda o seu Ollama, informe o endereço público dele (https); o servidor do ClipGringa não alcança o localhost do seu computador. O modelo é opcional: sem ele, uso o primeiro que o Ollama listar."},
    "apify": {"label": "Apify (busca de fotos no Pinterest)", "help": "Token do Apify (console.apify.com/settings/integrations). Sem ele, a busca usa um banco de fotos grátis."},
    "flow": {"label": "Chave do Google para o Veo (opcional)", "help": "Isto NÃO é a conta do Flow. A conta do Flow conecta pela extensão, na página Conectar ao Flow. Aqui só entra uma chave do Google AI Studio com acesso ao Veo."},
}

# Chaves do usuário da requisição atual (preenchido por load_user_keys).
_current_keys: contextvars.ContextVar[dict[str, str]] = contextvars.ContextVar("user_keys", default={})


def _hint(value: str) -> str:
    return value[-4:] if len(value) >= 8 else ""


DEFAULT_OLLAMA_URL = "https://ollama.com"


def pack_ollama(key: str, url: str, model: str) -> str:
    """O Ollama precisa de endereço, chave (opcional) e modelo: guardados juntos, criptografados como as outras chaves."""
    import json

    return json.dumps({"url": url.rstrip("/") or DEFAULT_OLLAMA_URL, "key": key, "model": model}, ensure_ascii=False)


def unpack_ollama(value: str) -> dict[str, str]:
    import json

    try:
        data = json.loads(value)
        if isinstance(data, dict):
            return {"url": str(data.get("url") or DEFAULT_OLLAMA_URL).rstrip("/"), "key": str(data.get("key") or ""), "model": str(data.get("model") or "")}
    except Exception:
        pass
    return {"url": DEFAULT_OLLAMA_URL, "key": value, "model": ""}


async def ollama_probe(url: str, key: str) -> tuple[bool, str, list[str]]:
    """Testa o endereço e a chave do Ollama e lista os modelos. (ok, motivo, modelos)."""
    import asyncio
    from urllib.parse import urlparse

    from .api.routes.clone_plan import _public_https

    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return False, "O endereço do Ollama precisa começar com https:// (ex.: https://ollama.com).", []
    if not await asyncio.to_thread(_public_https, url):
        return False, "Esse endereço não é público. O servidor do ClipGringa não alcança o localhost do seu computador: use o Ollama Cloud ou um endereço https público.", []
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            r = await client.get(f"{url.rstrip('/')}/api/tags", headers=headers)
    except Exception:
        return False, "Não consegui falar com esse endereço. Confira se ele está no ar e é https.", []
    if r.status_code in (401, 403):
        return False, "O Ollama recusou essa chave. Confira se copiou inteira.", []
    if r.status_code != 200:
        return False, "Esse endereço não respondeu como um Ollama.", []
    try:
        models = [str(m.get("name") or m.get("model") or "") for m in (r.json().get("models") or []) if isinstance(m, dict)]
    except Exception:
        models = []
    return True, "", [m for m in models if m]


def pick_ollama_model(models: list[str]) -> str:
    for preferred in ("gpt-oss", "qwen", "llama", "deepseek"):
        for name in models:
            if preferred in name.lower():
                return name
    return models[0] if models else ""


async def list_integrations(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    rows = (await db.execute(
        text("SELECT provider, hint, updated_at FROM user_integrations WHERE user_id = :u"), {"u": user_id}
    )).mappings().all()
    saved = {r["provider"]: r for r in rows}
    out = []
    for key, meta in PROVIDERS.items():
        row = saved.get(key)
        out.append({
            "provider": key, "label": meta["label"], "help": meta["help"],
            "connected": row is not None, "hint": row["hint"] if row else "",
            "updated_at": row["updated_at"].isoformat() if row and row["updated_at"] else None,
        })
    return out


async def save_integration(db: AsyncSession, user_id: str, provider: str, value: str, hint: str | None = None) -> None:
    await db.execute(
        text(
            """
            INSERT INTO user_integrations (user_id, provider, encrypted_value, hint)
            VALUES (:u, :p, :v, :h)
            ON CONFLICT (user_id, provider)
            DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, hint = EXCLUDED.hint, updated_at = CURRENT_TIMESTAMP
            """
        ),
        {"u": user_id, "p": provider, "v": encrypt_setting_value(value), "h": hint if hint is not None else _hint(value)},
    )
    await db.commit()


async def delete_integration(db: AsyncSession, user_id: str, provider: str) -> bool:
    res = await db.execute(text("DELETE FROM user_integrations WHERE user_id = :u AND provider = :p"), {"u": user_id, "p": provider})
    await db.commit()
    return (res.rowcount or 0) > 0


async def check_key(provider: str, value: str) -> tuple[bool, str]:
    """Testa a chave direto no provedor. (True, '') se válida; (False, motivo) se recusada."""
    if provider in {"gemini", "flow"}:
        url, headers = f"https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key={value}", {}
    elif provider == "openai":
        url, headers = "https://api.openai.com/v1/models", {"Authorization": f"Bearer {value}"}
    elif provider == "anthropic":
        url, headers = "https://api.anthropic.com/v1/models", {"x-api-key": value, "anthropic-version": "2023-06-01"}
    elif provider == "apify":
        url, headers = "https://api.apify.com/v2/users/me", {"Authorization": f"Bearer {value}"}
    elif provider == "openrouter":
        url, headers = "https://openrouter.ai/api/v1/auth/key", {"Authorization": f"Bearer {value}"}
    else:
        return False, "Provedor desconhecido."
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=headers)
    except Exception:
        # Sem resposta do provedor: não bloqueia, a chave é salva e testada no primeiro uso.
        return True, ""
    if r.status_code in (400, 401, 403):
        return False, "O provedor recusou essa chave. Confira se copiou inteira."
    return True, ""


async def load_user_keys(db: AsyncSession, user_id: str) -> dict[str, str]:
    """Carrega (e deixa disponível para esta requisição) as chaves do usuário."""
    keys: dict[str, str] = {}
    try:
        rows = (await db.execute(text("SELECT provider, encrypted_value FROM user_integrations WHERE user_id = :u"), {"u": user_id})).mappings().all()
        for row in rows:
            try:
                keys[row["provider"]] = decrypt_setting_value(row["encrypted_value"])
            except Exception:
                logger.warning("integração %s ilegível para o usuário", row["provider"])
    except Exception:
        logger.exception("não foi possível carregar as integrações do usuário")
    _current_keys.set(keys)
    from .usage import set_usage_user

    set_usage_user(user_id)  # a conta de IA ligada pela extensão é buscada por este usuário
    # Chaves da casa (dos administradores): reserva automática quando as demais falham ou a cota acaba.
    house: dict[str, str] = {}
    try:
        rows = (await db.execute(text(
            "SELECT i.provider, i.encrypted_value FROM user_integrations i JOIN users u ON u.id = i.user_id "
            "WHERE u.is_admin = TRUE AND i.provider IN ('anthropic','openai','gemini','openrouter') ORDER BY i.updated_at DESC"
        ))).mappings().all()
        for row in rows:
            if row["provider"] in house:
                continue
            try:
                house[row["provider"]] = decrypt_setting_value(row["encrypted_value"])
            except Exception:
                logger.warning("chave da casa %s ilegível", row["provider"])
    except Exception:
        logger.exception("não foi possível carregar as chaves da casa")
    _house_keys.set(house)
    return keys


_house_keys: contextvars.ContextVar[dict[str, str]] = contextvars.ContextVar("house_keys", default={})


def current_keys() -> dict[str, str]:
    return _current_keys.get()


def user_models(include_account: bool = True) -> list[Any]:
    """Modelos de texto do próprio usuário: primeiro as chaves de API dele, depois a conta de IA ligada pela extensão.

    Os dois têm prioridade sobre os do servidor. `include_account=False` para pedidos com imagem (a conta só recebe texto).
    """
    keys = current_keys()
    out: list[Any] = []
    gem = keys.get("gemini") or keys.get("flow")
    if gem:
        from pydantic_ai.models.google import GoogleModel
        from pydantic_ai.providers.google import GoogleProvider
        for name in ("gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"):
            out.append(GoogleModel(name, provider=GoogleProvider(api_key=gem)))
    if keys.get("anthropic"):
        from pydantic_ai.models.anthropic import AnthropicModel
        from pydantic_ai.providers.anthropic import AnthropicProvider
        out.append(AnthropicModel("claude-sonnet-5-5", provider=AnthropicProvider(api_key=keys["anthropic"])))
    if keys.get("openai"):
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider
        out.append(OpenAIChatModel("gpt-5-mini", provider=OpenAIProvider(api_key=keys["openai"])))
    if keys.get("openrouter"):
        from pydantic_ai.models.openrouter import OpenRouterModel
        from pydantic_ai.providers.openrouter import OpenRouterProvider
        out.append(OpenRouterModel("anthropic/claude-sonnet-5.5", provider=OpenRouterProvider(api_key=keys["openrouter"])))
    if keys.get("ollama"):
        cfg = unpack_ollama(keys["ollama"])
        if cfg["model"]:
            from pydantic_ai.models.ollama import OllamaModel
            from pydantic_ai.providers.ollama import OllamaProvider
            out.append(OllamaModel(cfg["model"], provider=OllamaProvider(base_url=cfg["url"] + "/v1", api_key=cfg["key"] or None)))
    if include_account:
        from .ai_relay import account_model
        from .usage import _usage_user

        account = account_model(_usage_user.get())
        if account is not None:
            out.append(account)
    return out


def _models_from(keys: dict[str, str], skip: dict[str, str] | None = None) -> list[Any]:
    skip = skip or {}
    out: list[Any] = []
    gem = keys.get("gemini") or keys.get("flow")
    if keys.get("anthropic") and keys["anthropic"] != skip.get("anthropic"):
        from pydantic_ai.models.anthropic import AnthropicModel
        from pydantic_ai.providers.anthropic import AnthropicProvider
        out.append(AnthropicModel("claude-sonnet-5-5", provider=AnthropicProvider(api_key=keys["anthropic"])))
    if keys.get("openai") and keys["openai"] != skip.get("openai"):
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider
        out.append(OpenAIChatModel("gpt-5-mini", provider=OpenAIProvider(api_key=keys["openai"])))
    if gem and gem != skip.get("gemini"):
        from pydantic_ai.models.google import GoogleModel
        from pydantic_ai.providers.google import GoogleProvider
        out.append(GoogleModel("gemini-3.5-flash", provider=GoogleProvider(api_key=gem)))
    return out


def house_models() -> list[Any]:
    """Reserva final: modelos com as chaves dos administradores (Claude primeiro). Só entram quando os demais falham."""
    own = current_keys()
    return _models_from(_house_keys.get(), skip={k: v for k, v in own.items()})
