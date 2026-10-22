"""Registro de tokens gastos nas chamadas de IA de texto, por usuário (aparece no Admin)."""
from __future__ import annotations

import contextvars
import logging
import os
from typing import Any

from sqlalchemy import text

logger = logging.getLogger(__name__)

_usage_user: contextvars.ContextVar[str | None] = contextvars.ContextVar("usage_user", default=None)


def set_usage_user(user_id: str | None) -> None:
    _usage_user.set(user_id)


async def record_usage(stage: str, model: Any, usage: Any, own_key: bool = False) -> None:
    """Nunca derruba a geração: se não der para registrar, só avisa no log."""
    user_id = _usage_user.get()
    if not user_id or usage is None:
        return
    try:
        from .database import AsyncSessionLocal

        name = str(getattr(model, "model_name", None) or model)[:120]
        tokens_in = int(getattr(usage, "input_tokens", 0) or getattr(usage, "request_tokens", 0) or 0)
        tokens_out = int(getattr(usage, "output_tokens", 0) or getattr(usage, "response_tokens", 0) or 0)
        async with AsyncSessionLocal() as session:
            await session.execute(
                text(
                    "INSERT INTO llm_usage (user_id, stage, model, input_tokens, output_tokens, own_key) "
                    "VALUES (:u, :s, :m, :i, :o, :k)"
                ),
                {"u": user_id, "s": stage[:60], "m": name, "i": tokens_in, "o": tokens_out, "k": own_key},
            )
            await session.commit()
    except Exception:
        logger.warning("não foi possível registrar o uso de tokens", exc_info=True)


# ---------------------------------------------------------------------------
# Saldo de tokens do membro (só conta os tokens pagos pelo servidor)
# ---------------------------------------------------------------------------

# O saldo depende do plano de cada pessoa: quem ainda não recebeu tokens do administrador começa com 0.
DEFAULT_QUOTA = int(os.getenv("DEFAULT_TOKEN_QUOTA", "0"))

_server_blocked: contextvars.ContextVar[bool] = contextvars.ContextVar("server_blocked", default=False)


def set_server_blocked(value: bool) -> None:
    _server_blocked.set(bool(value))


def server_blocked() -> bool:
    return _server_blocked.get()


def balance_from(is_admin: bool, granted: int | None, used: int) -> dict[str, Any]:
    if is_admin:
        return {"unlimited": True, "granted": None, "used": int(used), "remaining": None, "exhausted": False}
    total = DEFAULT_QUOTA if granted is None else int(granted)
    remaining = max(0, total - int(used))
    return {"unlimited": False, "granted": total, "used": int(used), "remaining": remaining, "exhausted": remaining <= 0}


async def get_balance(db: Any, user_id: str) -> dict[str, Any]:
    row = (
        await db.execute(
            text(
                """
                SELECT u.is_admin, q.granted,
                       COALESCE((SELECT SUM(input_tokens + output_tokens) FROM llm_usage
                                 WHERE user_id = u.id AND NOT own_key), 0) AS used
                FROM users u LEFT JOIN user_token_quota q ON q.user_id = u.id
                WHERE u.id = :u
                """
            ),
            {"u": user_id},
        )
    ).mappings().first()
    if not row:
        return balance_from(False, 0, 0)
    return balance_from(bool(row["is_admin"]), row["granted"], int(row["used"] or 0))
