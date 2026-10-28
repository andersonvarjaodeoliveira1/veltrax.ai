"""Alertas de segurança por e-mail: agrupa os sinais (varreduras, robôs, tentativas de copiar) e manda um resumo."""
from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .auth_headers import get_authenticated_user_id
from .config import get_config
from .database import get_db
from .services.email_service import EmailContent, SesEmailService

logger = logging.getLogger(__name__)

# Quem recebe os alertas. Pode ser trocado na hospedagem com SECURITY_ALERT_EMAILS (lista separada por vírgula).
DEFAULT_ALERT_EMAILS = ("andersonvarjaodeoliveira1@gmail.com", "gringatools@gmail.com")
FLUSH_SECONDS = 300
MAX_EVENTS_PER_MAIL = 60
USER_THROTTLE_SECONDS = 600
BRT = timezone(timedelta(hours=-3))

KINDS = {
    "contextmenu": "clicou com o botão direito na página",
    "devtools_shortcut": "tentou abrir as ferramentas do navegador (F12 / Ctrl+Shift+I)",
    "view_source": "tentou ver o código-fonte da página (Ctrl+U)",
    "paste_code": "colou um trecho parecido com código em um campo",
    "copy_large": "copiou um bloco grande de texto da tela",
    "automation": "navegador automatizado / robô detectado (conta bloqueada)",
    "blocked": "conta bloqueada por atividade incomum (2 tentativas)",
    "scanner": "ferramenta de varredura bloqueada",
    "probe": "tentou acessar um caminho de sondagem",
    "rate": "excesso de requisições (bloqueado)",
    "ban": "muitos erros 404 seguidos (IP bloqueado)",
}


def recipients() -> list[str]:
    raw = os.getenv("SECURITY_ALERT_EMAILS", "")
    items = [item.strip() for item in raw.split(",") if item.strip()] if raw.strip() else list(DEFAULT_ALERT_EMAILS)
    return items


class AlertBuffer:
    def __init__(self) -> None:
        self.events: deque[dict] = deque(maxlen=500)
        self.last_seen: dict[tuple[str, str], float] = {}

    def add(self, kind: str, who: str, detail: str = "", dedupe_seconds: float = 0, now: float | None = None) -> bool:
        """Registra um sinal. Com dedupe_seconds, o mesmo tipo + mesma origem só conta uma vez nesse intervalo."""
        now = time.monotonic() if now is None else now
        key = (kind, who)
        if dedupe_seconds and now - self.last_seen.get(key, -1e12) < dedupe_seconds:
            return False
        self.last_seen[key] = now
        if len(self.last_seen) > 5000:
            self.last_seen = {k: v for k, v in self.last_seen.items() if now - v < 3600}
        self.events.append({"at": datetime.now(BRT), "kind": kind, "who": who, "detail": detail[:200]})
        return True

    def drain(self) -> list[dict]:
        items = list(self.events)
        self.events.clear()
        return items


buffer = AlertBuffer()


def build_email(events: list[dict]) -> EmailContent:
    shown = events[:MAX_EVENTS_PER_MAIL]
    more = len(events) - len(shown)
    rows = "".join(
        f"<tr><td style='padding:4px 10px;white-space:nowrap'>{e['at'].strftime('%d/%m %H:%M')}</td>"
        f"<td style='padding:4px 10px'>{escape(KINDS.get(e['kind'], e['kind']))}</td>"
        f"<td style='padding:4px 10px'>{escape(e['who'])}</td>"
        f"<td style='padding:4px 10px;color:#666'>{escape(e['detail'])}</td></tr>"
        for e in shown
    )
    lines = "\n".join(f"{e['at'].strftime('%d/%m %H:%M')} · {KINDS.get(e['kind'], e['kind'])} · {e['who']} · {e['detail']}" for e in shown)
    tail = f"\n(+{more} sinais não listados)" if more > 0 else ""
    intro = "Estes sinais foram registrados no ClipGringa nos últimos minutos. Botão direito e atalhos podem ser uso normal: são pistas, não prova de cópia."
    return EmailContent(
        subject=f"Alerta de segurança ClipGringa ({len(events)} {'sinal' if len(events) == 1 else 'sinais'})",
        html=(
            f"<p>{escape(intro)}</p>"
            f"<table style='border-collapse:collapse;font-size:13px'>{rows}</table>"
            + (f"<p>+{more} sinais não listados.</p>" if more > 0 else "")
            + "<p>Equipe ClipGringa</p>"
        ),
        text=f"{intro}\n\n{lines}{tail}\n\nEquipe ClipGringa",
    )


async def flush_once() -> int:
    events = buffer.drain()
    if not events:
        return 0
    service = SesEmailService(get_config())
    if not service.is_configured:
        logger.warning("alertas de segurança não enviados: e-mail de envio não configurado (%d sinais)", len(events))
        return 0
    content = build_email(events)
    sent = 0
    for address in recipients():
        try:
            await service.send_email(address, content)
            sent += 1
        except Exception:
            logger.warning("falha ao enviar alerta de segurança para um destinatário", exc_info=True)
    return sent


async def alert_forever() -> None:
    while True:
        await asyncio.sleep(FLUSH_SECONDS)
        try:
            await flush_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("falha no envio dos alertas de segurança", exc_info=True)


router = APIRouter(prefix="/security", tags=["security"])


class Report(BaseModel):
    kind: str = Field(max_length=40)
    page: str = Field(default="", max_length=120)
    detail: str = Field(default="", max_length=120)


# Tentativas de copiar o aplicativo que contam para o bloqueio. Botão direito só gera alerta, não conta.
STRIKE_KINDS = ("devtools_shortcut", "view_source", "paste_code", "copy_large", "automation")
BLOCK_AT = 2
STRIKE_DEDUPE_SECONDS = 20


async def _strike_state(db: AsyncSession, user_id: str) -> dict:
    row = (await db.execute(text("SELECT strikes, blocked_at FROM security_strikes WHERE user_id = :u"), {"u": user_id})).first()
    strikes = int(row[0]) if row else 0
    return {"strikes": strikes, "blocked": bool(row and row[1]), "limit": BLOCK_AT}


@router.post("/report")
async def report(body: Report, request: Request, db: AsyncSession = Depends(get_db)):
    """O site avisa quando alguém tenta copiar o aplicativo (botão direito, F12, colar código, robô). Administradores não contam.
    Na 2ª tentativa (ou na hora, se for robô) a conta é bloqueada e a pessoa é mandada falar com o administrador."""
    if body.kind not in ("contextmenu",) + STRIKE_KINDS:
        raise HTTPException(status_code=400, detail="Tipo desconhecido")
    user_id = get_authenticated_user_id(request, get_config())
    row = (await db.execute(text("SELECT email, is_admin FROM users WHERE id = :u"), {"u": user_id})).first()
    if not row or row[1]:
        return {"ok": True, "strikes": 0, "blocked": False, "limit": BLOCK_AT}
    who = row[0] or user_id
    page = body.page.split("?")[0]
    buffer.add(body.kind, who, f"{page} {body.detail}".strip(), dedupe_seconds=USER_THROTTLE_SECONDS)
    if body.kind not in STRIKE_KINDS:
        return {"ok": True, **await _strike_state(db, user_id)}
    current = (await db.execute(
        text("SELECT strikes, blocked_at, last_at, last_kind FROM security_strikes WHERE user_id = :u"), {"u": user_id}
    )).first()
    strikes = int(current[0]) if current else 0
    blocked = bool(current and current[1])
    if not blocked:
        recent = bool(current and current[3] == body.kind and (datetime.now(timezone.utc) - current[2]).total_seconds() < STRIKE_DEDUPE_SECONDS)
        if body.kind == "automation":
            strikes = max(strikes, BLOCK_AT)
        elif not recent:
            strikes += 1
        blocked = strikes >= BLOCK_AT
        await db.execute(
            text(
                """
                INSERT INTO security_strikes (user_id, strikes, last_kind, last_at, blocked_at)
                VALUES (:u, :s, :k, now(), CASE WHEN :b THEN now() END)
                ON CONFLICT (user_id) DO UPDATE SET strikes = :s, last_kind = :k, last_at = now(),
                    blocked_at = COALESCE(security_strikes.blocked_at, CASE WHEN :b THEN now() END)
                """
            ),
            {"u": user_id, "s": strikes, "k": body.kind, "b": blocked},
        )
        await db.commit()
        if blocked:
            buffer.add("blocked", who, f"{page} {body.kind}", dedupe_seconds=3600)
    return {"ok": True, "strikes": strikes, "blocked": blocked, "limit": BLOCK_AT}


@router.get("/status")
async def status(request: Request, db: AsyncSession = Depends(get_db)):
    """Se a conta está avisada ou bloqueada por atividade incomum (o site mostra o aviso amarelo)."""
    user_id = get_authenticated_user_id(request, get_config())
    return await _strike_state(db, user_id)


@router.delete("/block/{user_id}")
async def unblock(user_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Administrador libera uma conta bloqueada por atividade incomum."""
    from .admin_auth import require_admin_user

    await require_admin_user(request, db, get_config())
    await db.execute(text("DELETE FROM security_strikes WHERE user_id = :u"), {"u": user_id})
    await db.commit()
    return {"ok": True}
