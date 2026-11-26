"""Entrada sem senha e conferência de assinatura (ver src/member_access.py)."""
import logging
import os
import smtplib
import time
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ... import member_access
from ...auth_headers import get_authenticated_user_id
from ...config import get_config
from ...database import get_db
from ...services.login_link_email_service import LoginLinkEmailService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/access", tags=["access"])

# Ninguém recebe uma enxurrada de e-mails porque outra pessoa digitou o endereço dela: 1 a cada 45 s, 6 por hora.
MIN_GAP_SECONDS = int(os.getenv("LOGIN_LINK_MIN_GAP_SECONDS") or 45)
MAX_PER_HOUR = 6
_sent: dict[str, list[float]] = {}


def _throttled(email: str, now: float | None = None) -> bool:
    now = time.time() if now is None else now
    recent = [at for at in _sent.get(email, []) if now - at < 3600]
    if recent and (now - recent[-1] < MIN_GAP_SECONDS or len(recent) >= MAX_PER_HOUR):
        _sent[email] = recent
        return True
    recent.append(now)
    _sent[email] = recent
    if len(_sent) > 20000:
        for key in [k for k, v in _sent.items() if not v or now - v[-1] >= 3600]:
            _sent.pop(key, None)
    return False


@router.get("/public-key")
async def public_key(db: AsyncSession = Depends(get_db)):
    """Chave pública com que a base da Gringatools confere as consultas deste servidor. Não é segredo."""
    return {"alg": "Ed25519", "public_key": await member_access.public_key_b64(db)}


class LoginLinkRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    url: str = Field(max_length=2000)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("url must be an absolute http(s) URL")
        return value


@router.post("/login-link")
async def send_login_link(body: LoginLinkRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Decide se o e-mail recebe o link de entrada e manda. Só o servidor do site chama (cabeçalhos assinados)."""
    config = get_config()
    get_authenticated_user_id(request, config)

    email = member_access.normalize_email(body.email)
    if not email:
        return {"status": "skip"}
    if _throttled(email):
        return {"status": "throttled"}

    decision = await member_access.login_decision(db, email)
    if decision.action == "skip":
        logger.info("link de entrada não enviado (%s)", decision.why)
        return {"status": "skip"}

    service = LoginLinkEmailService(config)
    try:
        if decision.action == "send":
            await service.send_link(email, decision.name, body.url)
        else:
            await service.send_inactive(email, decision.name)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except smtplib.SMTPAuthenticationError as exc:
        logger.error("SMTP login refused for the sender mailbox (login link)")
        raise HTTPException(status_code=502, detail="E-mail de envio recusado: usuário ou senha da caixa de e-mail incorretos.") from exc
    except Exception as exc:
        logger.exception("Failed to send login link email")
        raise HTTPException(status_code=502, detail="Failed to send login link email") from exc

    logger.info("link de entrada: %s (%s)", "enviado" if decision.action == "send" else "aviso de assinatura inativa", decision.why)
    return {"status": decision.action}
