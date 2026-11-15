"""Resposta automática na caixa de mensagens da Página.

A Meta avisa o servidor (webhook) quando alguém escreve para a Página. Se a mensagem traz a
palavra-chave de uma oferta, a pessoa recebe a mensagem daquela oferta; senão, a resposta padrão
da página. Cada pessoa recebe a mesma resposta no máximo uma vez a cada 24 horas, e a Página nunca
responde às próprias mensagens.

Segurança: o aviso só é aceito com a assinatura feita com a chave secreta do app (X-Hub-Signature-256).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .facebook import GRAPH, GRAPH_VERSION, _graph_error
from .facebook_meta import find_offer
from .runtime_settings import decrypt_setting_value

logger = logging.getLogger(__name__)

COOLDOWN_HOURS = 24
MAX_PER_CALL = 25  # mensagens tratadas por aviso; o resto fica registrado sem resposta
WEBHOOK_PATH = "/facebook/webhook"


def verify_token() -> str:
    """Frase de verificação do webhook, derivada da chave do servidor (não precisa configurar nada)."""
    from .runtime_settings import _get_encryption_secret

    return hmac.new(_get_encryption_secret().encode("utf-8"), b"meta-webhook-verify", hashlib.sha256).hexdigest()[:32]


def valid_signature(body: bytes, header: str | None, app_secret: str) -> bool:
    """Confere X-Hub-Signature-256: sha256=<hmac do corpo com a chave secreta do app>."""
    if not header or not app_secret or not header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len("sha256="):].strip())


def incoming_messages(payload: Any) -> list[dict[str, str]]:
    """Mensagens de texto que pessoas mandaram para a Página (ignora eco da própria Página, leitura e entrega)."""
    if not isinstance(payload, dict) or payload.get("object") != "page":
        return []
    out: list[dict[str, str]] = []
    for entry in payload.get("entry") or []:
        page_id = str((entry or {}).get("id") or "")
        for event in (entry or {}).get("messaging") or []:
            message = (event or {}).get("message") or {}
            sender = str(((event or {}).get("sender") or {}).get("id") or "")
            body = str(message.get("text") or "").strip()
            if not page_id or not sender or sender == page_id or message.get("is_echo") or not body or not message.get("mid"):
                continue
            out.append({"page_fb_id": page_id, "psid": sender[:60], "mid": str(message["mid"])[:200], "text": body[:1000]})
    return out


def choose_reply(message: str, offers: list[dict[str, Any]], default_reply: str) -> tuple[str, str]:
    """(resposta, palavra-chave). Oferta com a palavra na mensagem vence; senão, a resposta padrão da página."""
    offer = find_offer(message, offers)
    if offer and str(offer.get("dm_message") or "").strip():
        return str(offer["dm_message"]).strip(), str(offer.get("keyword") or "").strip()[:30]
    return (default_reply or "").strip(), ""


async def send_text(page_fb_id: str, token: str, psid: str, message: str, client: httpx.AsyncClient) -> None:
    r = await client.post(f"{GRAPH}/{GRAPH_VERSION}/{page_fb_id}/messages", params={"access_token": token},
                          json={"recipient": {"id": psid}, "message": {"text": message}, "messaging_type": "RESPONSE"})
    data = r.json() if r.content else {}
    if r.status_code >= 400 or (isinstance(data, dict) and "error" in data):
        raise ValueError(_graph_error(data, r.status_code))


async def subscribe_page(page_fb_id: str, token: str, client: httpx.AsyncClient) -> None:
    """Liga os avisos de mensagem da Página para o app (precisa da permissão pages_messaging no login)."""
    r = await client.post(f"{GRAPH}/{GRAPH_VERSION}/{page_fb_id}/subscribed_apps", params={"access_token": token, "subscribed_fields": "messages"})
    data = r.json() if r.content else {}
    if r.status_code >= 400 or (isinstance(data, dict) and "error" in data):
        raise ValueError(_graph_error(data, r.status_code))


async def handle(db: AsyncSession, payload: Any, client: httpx.AsyncClient) -> dict[str, int]:
    """Registra as mensagens novas e responde as que têm resposta. Devolve a contagem do que fez."""
    done = {"recebidas": 0, "respondidas": 0, "falharam": 0}
    for item in incoming_messages(payload)[:MAX_PER_CALL]:
        page = (await db.execute(text("""SELECT id, user_id, meta_token_enc, inbox_reply FROM fb_pages
            WHERE meta_page_id = :p AND inbox_on = TRUE AND meta_token_enc IS NOT NULL AND status = 'ativa' LIMIT 1"""),
            {"p": item["page_fb_id"]})).mappings().first()
        if not page:
            continue
        offers = [dict(r) for r in (await db.execute(text("SELECT name, product, keyword, dm_message FROM offers WHERE user_id = :u AND keyword <> ''"),
                                                     {"u": page["user_id"]})).mappings().all()]
        reply, keyword = choose_reply(item["text"], offers, page["inbox_reply"])
        row_id = str(uuid.uuid4())
        inserted = (await db.execute(text("""INSERT INTO fb_inbox (id, user_id, page_id, psid, mid, message, keyword)
            VALUES (:id, :u, :p, :psid, :mid, :msg, :k) ON CONFLICT (mid) DO NOTHING RETURNING id"""),
            {"id": row_id, "u": page["user_id"], "p": page["id"], "psid": item["psid"], "mid": item["mid"], "msg": item["text"], "k": keyword})).first()
        if not inserted:
            continue  # a Meta reenviou o mesmo aviso
        done["recebidas"] += 1
        if not reply:
            await db.execute(text("UPDATE fb_inbox SET reply_status = 'sem_resposta' WHERE id = :id"), {"id": row_id})
            continue
        recent = (await db.execute(text("""SELECT 1 FROM fb_inbox WHERE page_id = :p AND psid = :psid AND keyword = :k AND reply_status = 'enviada'
            AND replied_at > NOW() - make_interval(hours => :h) LIMIT 1"""),
            {"p": page["id"], "psid": item["psid"], "k": keyword, "h": COOLDOWN_HOURS})).first()
        if recent:
            await db.execute(text("UPDATE fb_inbox SET reply_status = 'recente' WHERE id = :id"), {"id": row_id})
            continue
        try:
            await send_text(item["page_fb_id"], decrypt_setting_value(page["meta_token_enc"]), item["psid"], reply, client)
            await db.execute(text("UPDATE fb_inbox SET reply_status = 'enviada', replied_at = NOW() WHERE id = :id"), {"id": row_id})
            done["respondidas"] += 1
        except Exception as exc:  # noqa: BLE001 - uma resposta que falha não derruba as outras
            await db.execute(text("UPDATE fb_inbox SET reply_status = 'falhou', reply_error = :e WHERE id = :id"), {"e": str(exc)[:300], "id": row_id})
            done["falharam"] += 1
    await db.commit()
    return done


async def inbox_status(db: AsyncSession) -> dict[str, Any]:
    """Para o quadro de status: páginas ligadas e o movimento dos últimos 7 dias."""
    pages = (await db.execute(text("SELECT COUNT(*) FILTER (WHERE inbox_on) AS on_pages, COUNT(*) FILTER (WHERE inbox_error IS NOT NULL) AS errors FROM fb_pages"))).mappings().first()
    week = (await db.execute(text("""SELECT COUNT(*) AS received, COUNT(*) FILTER (WHERE reply_status = 'enviada') AS replied,
        COUNT(*) FILTER (WHERE reply_status = 'falhou') AS failed, MAX(received_at) AS last_at,
        (SELECT reply_error FROM fb_inbox WHERE reply_status = 'falhou' ORDER BY received_at DESC LIMIT 1) AS last_error
        FROM fb_inbox WHERE received_at > NOW() - INTERVAL '7 days'"""))).mappings().first()
    return {"pages_on": int(pages["on_pages"] or 0), "pages_with_error": int(pages["errors"] or 0), "received": int(week["received"] or 0),
            "replied": int(week["replied"] or 0), "failed": int(week["failed"] or 0), "last_error": week["last_error"] or "",
            "last_at": week["last_at"].isoformat() if week["last_at"] else None}
