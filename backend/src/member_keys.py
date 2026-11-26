"""API própria obrigatória: de quem é a chave que paga a transcrição e a análise dos vídeos.

O ClipGringa é um bônus do assinante, então cada membro usa a própria chave do Gemini ou do ChatGPT (OpenAI),
cadastrada em Minhas APIs. As chaves do servidor (AssemblyAI e o modelo da casa) ficam só para o administrador
e para as contas a que o administrador liberou tokens.

O plano de uma conta é resolvido uma vez por pedido/trabalho e fica num contextvar, que acompanha as
chamadas feitas em outra thread (asyncio.to_thread copia o contexto).
"""
from __future__ import annotations

import contextvars
import logging
import os
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

MISSING_KEY_MESSAGE = (
    "Conecte a sua chave do Gemini ou do ChatGPT em Minhas APIs para usar o ClipGringa. "
    "A transcrição e a análise dos vídeos são feitas com a sua própria chave."
)
# Mesmos modelos de texto que o resto do app usa com a chave do membro (integrations.user_models).
GEMINI_TEXT_MODELS = ("gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite")
OPENAI_TEXT_MODEL = "gpt-5-mini"


class MemberKeyRequired(RuntimeError):
    """A conta precisa cadastrar a própria chave antes de usar."""

    def __init__(self) -> None:
        super().__init__(MISSING_KEY_MESSAGE)


@dataclass(frozen=True)
class KeyPlan:
    """house: chaves do servidor | own: chave do membro | missing: precisa cadastrar uma chave."""
    mode: str = "house"
    gemini: str = ""
    openai: str = ""

    @property
    def providers(self) -> list[str]:
        return [name for name, key in (("gemini", self.gemini), ("openai", self.openai)) if key]


HOUSE = KeyPlan()
_plan: contextvars.ContextVar[KeyPlan] = contextvars.ContextVar("member_key_plan", default=HOUSE)


def required() -> bool:
    """MEMBER_KEY_REQUIRED=false devolve o comportamento antigo (o servidor paga para todos)."""
    return (os.getenv("MEMBER_KEY_REQUIRED") or "true").strip().lower() not in ("false", "0", "off", "no")


def current_plan() -> KeyPlan:
    return _plan.get()


def set_plan(plan: KeyPlan) -> None:
    _plan.set(plan)


def plan_from(is_admin: bool, keys: dict[str, str], house_allowed: bool) -> KeyPlan:
    gemini = (keys.get("gemini") or "").strip()
    openai = (keys.get("openai") or "").strip()
    if is_admin:
        return HOUSE
    if gemini or openai:
        return KeyPlan("own", gemini=gemini, openai=openai)
    return HOUSE if house_allowed else KeyPlan("missing")


async def resolve(db: AsyncSession, user_id: str | None) -> KeyPlan:
    """Plano da conta. Sem conta identificada (instalação própria, chamadas internas) vale o servidor."""
    if not user_id or not required():
        return HOUSE
    from .runtime_settings import decrypt_setting_value
    from .usage import get_balance

    row = (await db.execute(text("SELECT is_admin FROM users WHERE id = :u"), {"u": user_id})).first()
    if row is None:
        return HOUSE
    if bool(row[0]):
        return HOUSE
    keys: dict[str, str] = {}
    rows = (await db.execute(
        text("SELECT provider, encrypted_value FROM user_integrations WHERE user_id = :u AND provider IN ('gemini', 'openai')"), {"u": user_id},
    )).all()
    for provider, encrypted in rows:
        try:
            keys[provider] = decrypt_setting_value(encrypted)
        except Exception:
            logger.warning("chave %s ilegível para o membro", provider)
    balance = await get_balance(db, user_id)
    return plan_from(False, keys, house_allowed=not balance["exhausted"])


async def activate(db: AsyncSession, user_id: str | None) -> KeyPlan:
    """Resolve o plano, deixa valendo para este pedido e recusa quem ainda não cadastrou a chave."""
    plan = await resolve(db, user_id)
    set_plan(plan)
    if plan.mode == "missing":
        raise MemberKeyRequired()
    return plan


def text_models(plan: KeyPlan | None = None) -> list[Any]:
    """Modelos de texto com a chave do membro, na ordem de tentativa (Gemini primeiro: tem cota grátis)."""
    plan = plan or current_plan()
    out: list[Any] = []
    if plan.mode != "own":
        return out
    if plan.gemini:
        from pydantic_ai.models.google import GoogleModel
        from pydantic_ai.providers.google import GoogleProvider

        provider = GoogleProvider(api_key=plan.gemini)
        out.extend(GoogleModel(name, provider=provider) for name in GEMINI_TEXT_MODELS)
    if plan.openai:
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        out.append(OpenAIChatModel(OPENAI_TEXT_MODEL, provider=OpenAIProvider(api_key=plan.openai)))
    return out
