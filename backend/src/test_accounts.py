"""Contas de teste: ficam ativas por alguns dias e depois são desativadas sozinhas."""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

SWEEP_SECONDS = 300


async def deactivate_expired(db: AsyncSession) -> int:
    """Encerra as sessões e revoga as chaves de acesso das contas de teste vencidas (nunca de administradores)."""
    expired = "SELECT id FROM users WHERE test_expires_at IS NOT NULL AND test_expires_at < NOW() AND is_admin = FALSE"
    sessions = await db.execute(text(f'DELETE FROM session WHERE "userId" IN ({expired})'))
    keys = await db.execute(text(f"UPDATE api_keys SET revoked_at = NOW() WHERE revoked_at IS NULL AND user_id IN ({expired})"))
    await db.commit()
    return int((sessions.rowcount or 0) + (keys.rowcount or 0))


async def sweep_forever(session_factory) -> None:
    while True:
        try:
            async with session_factory() as db:
                closed = await deactivate_expired(db)
                if closed:
                    logger.info("contas de teste vencidas: %d sessões/chaves encerradas", closed)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("falha ao desativar contas de teste vencidas", exc_info=True)
        await asyncio.sleep(SWEEP_SECONDS)
