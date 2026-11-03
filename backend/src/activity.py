"""Registro de atividade para o painel do administrador: o que cada conta está gerando e onde deu erro.

Nunca derruba o pedido: se não der para gravar, só avisa no log.
"""

import asyncio
import logging

from sqlalchemy import text

logger = logging.getLogger(__name__)

# Tipos de evento (o painel mostra estes nomes)
IMAGE = "imagem"          # imagem criada (Flow, Kie.ai ou servidor)
SCENE = "cena"            # vídeo/cena criada ou enviada pelo Flow
TEXT_FAIL = "ia_conta_falhou"  # a conta de IA (Gemini etc.) da pessoa não respondeu
ERROR = "erro"            # erro do servidor ou de uma etapa de geração

ERROR_KINDS = (ERROR, TEXT_FAIL)

_pending: set["asyncio.Task[None]"] = set()


async def record(user_id: str | None, kind: str, detail: str = "") -> None:
    try:
        from .database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await session.execute(
                text("INSERT INTO activity_events (user_id, kind, detail) VALUES (:u, :k, :d)"),
                {"u": (user_id or None), "k": kind[:40], "d": (detail or "")[:500]},
            )
            await session.commit()
    except Exception:
        logger.warning("não foi possível registrar a atividade (%s)", kind, exc_info=True)


def note(user_id: str | None, kind: str, detail: str = "") -> None:
    """Registra em segundo plano, sem esperar (para usar dentro de pedidos)."""
    try:
        task = asyncio.get_running_loop().create_task(record(user_id, kind, detail))
    except RuntimeError:
        return
    _pending.add(task)
    task.add_done_callback(_pending.discard)
