"""Módulo Facebook (em construção, só administradores).

- Horários: cada página recebe N posts por dia (manhã, tarde e noite), em minutos variados.
- Publicador: o que está pendente numa página conectada à Meta vai para o Facebook pela
  Graph API, já agendado no horário (o Facebook aceita de 10 minutos a 30 dias à frente).
  Roda a cada 5 minutos no worker e também quando alguém clica em "Enviar agora".
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import uuid
from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .runtime_settings import decrypt_setting_value

logger = logging.getLogger(__name__)

BR = ZoneInfo("America/Sao_Paulo")
GRAPH = os.getenv("META_GRAPH_URL", "https://graph.facebook.com").rstrip("/")
GRAPH_VIDEO = os.getenv("META_GRAPH_VIDEO_URL", "https://graph-video.facebook.com").rstrip("/")
GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v21.0")

# Janelas do dia (horário de Brasília): manhã, tarde, noite e uma extra no fim da noite
WINDOWS = [(time(8, 0), time(11, 30)), (time(12, 0), time(17, 0)), (time(18, 0), time(22, 0)), (time(22, 0), time(23, 30))]
MIN_GAP = timedelta(minutes=90)
SCHEDULE_AHEAD = timedelta(minutes=15)   # menos que isso: publica na hora
MAX_AHEAD = timedelta(days=29)
LATE_LIMIT = timedelta(hours=6)          # passou disso sem enviar: não publica atrasado
MAX_ATTEMPTS = 3

ACCOUNT_STATUS = ("ativa", "confirmacao", "restricao", "bloqueada")
PAGE_STATUS = ("ativa", "restricao", "bloqueada")


def day_slots(page_id: str, day: date, per_day: int) -> list[datetime]:
    """Horários do dia para a página: um por janela, minuto variado e nunca redondo. Sempre os mesmos para a mesma página e dia."""
    seed = int(hashlib.sha256(f"{page_id}|{day.isoformat()}".encode()).hexdigest()[:12], 16)
    rnd = random.Random(seed)
    slots = []
    for start, end in WINDOWS[: max(1, min(4, per_day))]:
        a = start.hour * 60 + start.minute
        b = end.hour * 60 + end.minute
        while True:
            m = rnd.randint(a, b - 1)
            if m % 5:  # evita 9:00, 9:15, 9:30...
                break
        slots.append(datetime.combine(day, time(m // 60, m % 60), tzinfo=BR))
    return slots


def plan_times(page_id: str, per_day: int, count: int, taken: Iterable[datetime], now: datetime) -> list[datetime]:
    """Próximos `count` horários livres da página, a partir de 30 minutos depois de agora."""
    taken = sorted(t.astimezone(BR) for t in taken)
    earliest = now.astimezone(BR) + timedelta(minutes=30)
    out: list[datetime] = []
    day = earliest.date()
    for _ in range(120):
        if len(out) >= count:
            break
        used_today = [t for t in taken + out if t.date() == day]
        free = max(0, per_day - len(used_today))
        for slot in day_slots(page_id, day, per_day):
            if free <= 0 or len(out) >= count:
                break
            if slot < earliest or any(abs(slot - t) < MIN_GAP for t in taken + out):
                continue
            out.append(slot)
            free -= 1
        day += timedelta(days=1)
    return out


def caption_for(hook_title: str | None, text_value: str | None) -> str:
    """Legenda do corte: o título do gancho e um pedaço da fala."""
    hook = (hook_title or "").strip()
    body = " ".join((text_value or "").split())
    if len(body) > 220:
        body = body[:220].rsplit(" ", 1)[0] + "…"
    return "\n\n".join(x for x in (hook, body) if x)


async def add_event(db: AsyncSession, user_id: str, text_value: str, *, page_id: str | None = None, account_id: str | None = None, actor: str = "app") -> None:
    await db.execute(
        text("INSERT INTO fb_events (id, user_id, page_id, account_id, actor, text) VALUES (:id, :u, :p, :a, :actor, :t)"),
        {"id": str(uuid.uuid4()), "u": user_id, "p": page_id, "a": account_id, "actor": actor if actor in ("app", "voce", "claude") else "app", "t": text_value[:400]},
    )


def _graph_error(data: Any, status: int) -> str:
    err = data.get("error") if isinstance(data, dict) else None
    if not isinstance(err, dict):
        return f"Erro {status} do Facebook"
    code = err.get("code")
    if code == 190:
        return "Token vencido ou inválido. Conecte a página de novo."
    if code in (10, 200):
        return "O token não tem permissão para postar (pages_manage_posts)."
    return str(err.get("error_user_msg") or err.get("message") or f"Erro {status} do Facebook")[:300]


async def check_page_token(token: str, client: httpx.AsyncClient | None = None) -> dict[str, str]:
    """Confere o token e devolve a página dele (id e nome)."""
    own = client is None
    client = client or httpx.AsyncClient(timeout=20)
    try:
        r = await client.get(f"{GRAPH}/{GRAPH_VERSION}/me", params={"fields": "id,name", "access_token": token})
        data = r.json() if r.content else {}
        if r.status_code >= 400 or "error" in data:
            raise ValueError(_graph_error(data, r.status_code))
        if not data.get("id"):
            raise ValueError("O Facebook não devolveu a página desse token")
        return {"id": str(data["id"]), "name": str(data.get("name") or "")}
    finally:
        if own:
            await client.aclose()


async def _upload_photo_bytes(client: httpx.AsyncClient, *, page_id: str, token: str, data: bytes, filename: str) -> str:
    """Sobe uma foto (bytes) na página SEM publicar no feed e devolve o id. Precisa de pages_manage_posts."""
    r = await client.post(
        f"{GRAPH}/{GRAPH_VERSION}/{page_id}/photos",
        data={"access_token": token, "published": "false"},
        files={"source": (filename or "image.jpg", data, "application/octet-stream")},
    )
    body = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in body:
        raise ValueError(_graph_error(body, r.status_code))
    photo_id = str(body.get("id") or "")
    if not photo_id:
        raise ValueError("O Facebook não devolveu o id da foto enviada")
    return photo_id


async def set_page_picture_file(client: httpx.AsyncClient, *, page_id: str, token: str, data: bytes, filename: str) -> str:
    """Define a foto de PERFIL da página a partir de um arquivo. Precisa de pages_manage_metadata (+ pages_manage_posts)."""
    photo_id = await _upload_photo_bytes(client, page_id=page_id, token=token, data=data, filename=filename)
    r = await client.post(
        f"{GRAPH}/{GRAPH_VERSION}/{page_id}/picture",
        data={"access_token": token, "photo": photo_id},
    )
    body = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in body:
        raise ValueError(_graph_error(body, r.status_code))
    return photo_id


async def set_page_cover_file(client: httpx.AsyncClient, *, page_id: str, token: str, data: bytes, filename: str, offset_y: int | None = None) -> str:
    """Define a CAPA da página a partir de um arquivo (sobe sem publicar, depois aponta como capa). Precisa de pages_manage_metadata."""
    photo_id = await _upload_photo_bytes(client, page_id=page_id, token=token, data=data, filename=filename)
    params: dict[str, str] = {"access_token": token, "cover": photo_id}
    if offset_y is not None:
        params["offset_y"] = str(max(0, min(100, offset_y)))
    r = await client.post(f"{GRAPH}/{GRAPH_VERSION}/{page_id}", data=params)
    body = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in body:
        raise ValueError(_graph_error(body, r.status_code))
    return photo_id


async def get_page_profile(client: httpx.AsyncClient, *, page_id: str, token: str) -> dict[str, Any]:
    """Lê o perfil atual da página: bio curta (about), descrição e categoria (nome + lista com IDs)."""
    r = await client.get(
        f"{GRAPH}/{GRAPH_VERSION}/{page_id}",
        params={"fields": "about,description,category,category_list", "access_token": token},
    )
    body = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in body:
        raise ValueError(_graph_error(body, r.status_code))
    cat_list = [
        {"id": str(c.get("id") or ""), "name": str(c.get("name") or "")}
        for c in (body.get("category_list") or [])
        if c.get("id")
    ]
    return {
        "about": str(body.get("about") or ""),
        "description": str(body.get("description") or ""),
        "category": str(body.get("category") or ""),
        "category_id": cat_list[0]["id"] if cat_list else "",
        "category_list": cat_list,
    }


async def set_page_profile(client: httpx.AsyncClient, *, page_id: str, token: str, about: str | None = None, description: str | None = None) -> None:
    """Atualiza a bio curta (about) e/ou a descrição da página. Precisa de pages_manage_metadata."""
    params: dict[str, str] = {"access_token": token}
    if about is not None:
        params["about"] = about
    if description is not None:
        params["description"] = description
    if len(params) == 1:  # nada para mudar
        return
    r = await client.post(f"{GRAPH}/{GRAPH_VERSION}/{page_id}", data=params)
    body = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in body:
        raise ValueError(_graph_error(body, r.status_code))


async def set_page_category(client: httpx.AsyncClient, *, page_id: str, token: str, category_id: str) -> None:
    """Define a categoria da página a partir de um ID de categoria do Facebook (não o nome).

    A Meta espera `category_list` como um array de IDs; mandamos JSON com um ID.
    Mudar categoria pode disparar re-análise da página pela Meta.
    """
    r = await client.post(
        f"{GRAPH}/{GRAPH_VERSION}/{page_id}",
        data={"access_token": token, "category_list": json.dumps([str(category_id)])},
    )
    body = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in body:
        raise ValueError(_graph_error(body, r.status_code))


async def send_post(client: httpx.AsyncClient, *, page_id: str, token: str, kind: str, file_path: str | None, caption: str, when: datetime | None) -> str:
    """Manda um post para a página. `when` None publica agora. Devolve o id do post no Facebook."""
    data: dict[str, str] = {"access_token": token}
    if when is not None:
        data["published"] = "false"
        data["scheduled_publish_time"] = str(int(when.timestamp()))
    if kind == "texto":
        data["message"] = caption
        r = await client.post(f"{GRAPH}/{GRAPH_VERSION}/{page_id}/feed", data=data)
    else:
        if not file_path or not os.path.isfile(file_path):
            raise ValueError("O arquivo do vídeo não está mais no servidor")
        with open(file_path, "rb") as fh:  # noqa: ASYNC230 - o httpx lê o arquivo aos poucos durante o envio
            if kind == "video":
                data["description"] = caption
                r = await client.post(f"{GRAPH_VIDEO}/{GRAPH_VERSION}/{page_id}/videos", data=data, files={"source": (os.path.basename(file_path), fh, "video/mp4")})
            else:
                data["caption"] = caption
                r = await client.post(f"{GRAPH}/{GRAPH_VERSION}/{page_id}/photos", data=data, files={"source": (os.path.basename(file_path), fh, "image/jpeg")})
    body = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in body:
        raise ValueError(_graph_error(body, r.status_code))
    return str(body.get("post_id") or body.get("id") or "")


async def publish_due(db: AsyncSession, *, user_id: str | None = None, now: datetime | None = None, client: httpx.AsyncClient | None = None) -> dict[str, int]:
    """Envia ao Facebook os posts pendentes de páginas conectadas."""
    now = now or datetime.now(UTC)
    params: dict[str, Any] = {"from": now - LATE_LIMIT, "to": now + MAX_AHEAD, "max": MAX_ATTEMPTS}
    where = ""
    if user_id:
        where = "AND p.user_id = :u"
        params["u"] = user_id
    rows = (await db.execute(text(f"""
        SELECT p.id, p.user_id, p.page_id, p.kind, p.file_path, p.caption, p.title, p.scheduled_at, p.attempts,
               g.meta_page_id, g.meta_token_enc, g.name AS page_name
        FROM fb_posts p JOIN fb_pages g ON g.id = p.page_id LEFT JOIN fb_accounts a ON a.id = g.account_id
        WHERE p.status = 'pendente' AND p.attempts < :max AND g.meta_token_enc IS NOT NULL AND g.status = 'ativa'
          AND (a.id IS NULL OR a.status = 'ativa')
          AND p.scheduled_at BETWEEN :from AND :to {where}
        ORDER BY p.scheduled_at LIMIT 50
    """), params)).mappings().all()
    sent = failed = 0
    own = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(300, connect=20))
    try:
        for row in rows:
            when = row["scheduled_at"]
            schedule = when > now + SCHEDULE_AHEAD
            try:
                token = decrypt_setting_value(row["meta_token_enc"])
                fb_id = await send_post(client, page_id=row["meta_page_id"], token=token, kind=row["kind"], file_path=row["file_path"], caption=row["caption"], when=when if schedule else None)
                await db.execute(text("UPDATE fb_posts SET status = :s, fb_post_id = :f, error = NULL, updated_at = NOW() WHERE id = :id"),
                                 {"s": "agendado" if schedule else "publicado", "f": fb_id, "id": row["id"]})
                hora = when.astimezone(BR).strftime("%d/%m %H:%M")
                await add_event(db, row["user_id"], f"{'Agendado no Facebook' if schedule else 'Publicado'}: {row['title'] or 'post'}, {hora}", page_id=row["page_id"])
                sent += 1
            except Exception as exc:  # noqa: BLE001 - cada post falha sozinho
                msg = str(exc)[:300] or "Falhou"
                await db.execute(text("UPDATE fb_posts SET attempts = attempts + 1, error = :e, status = CASE WHEN attempts + 1 >= :max THEN 'falhou' ELSE status END, updated_at = NOW() WHERE id = :id"),
                                 {"e": msg, "id": row["id"], "max": MAX_ATTEMPTS})
                if "Token" in msg:
                    await db.execute(text("UPDATE fb_pages SET meta_error = :e WHERE id = :p"), {"e": msg, "p": row["page_id"]})
                failed += 1
            await db.commit()
    finally:
        if own:
            await client.aclose()
    return {"enviados": sent, "falharam": failed}


async def delete_remote(token: str, fb_post_id: str, client: httpx.AsyncClient | None = None) -> None:
    own = client is None
    client = client or httpx.AsyncClient(timeout=20)
    try:
        await client.delete(f"{GRAPH}/{GRAPH_VERSION}/{fb_post_id}", params={"access_token": token})
    finally:
        if own:
            await client.aclose()
