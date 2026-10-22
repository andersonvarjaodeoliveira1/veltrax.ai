"""Registro de tokens gastos nas chamadas de IA de texto, por usuário (aparece no Admin)."""
from __future__ import annotations

import contextvars
import logging
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
