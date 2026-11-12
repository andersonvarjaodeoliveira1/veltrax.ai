"""Entrar com o Facebook: a pessoa clica, autoriza as páginas e o ClipGringa guarda os tokens.

O app da Meta (App ID e chave secreta) é configurado uma vez pelo administrador em Admin,
Configurações. O token da pessoa vira um de longa duração (60 dias) e os tokens de página
que saem dele não vencem; tudo fica criptografado no banco e nunca volta para a tela.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
import unicodedata
import uuid
from datetime import datetime
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Config
from .facebook import GRAPH, GRAPH_VERSION, _graph_error
from .runtime_settings import _get_encryption_secret, decrypt_setting_value

SCOPES = ("pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_read_user_content", "business_management")
STATE_TTL = 15 * 60
CALLBACK_PATH = "/facebook/meta"


def meta_app() -> tuple[str, str] | None:
    app_id = (Config._get_runtime_setting("META_APP_ID") or "").strip()
    secret = (Config._get_runtime_setting("META_APP_SECRET") or "").strip()
    return (app_id, secret) if app_id and secret else None


def valid_redirect(uri: str) -> bool:
    """Só volta para a própria tela /facebook/meta do ClipGringa (https, ou localhost em teste)."""
    parsed = urlparse(uri or "")
    if parsed.path != CALLBACK_PATH or parsed.query or parsed.fragment:
        return False
    if parsed.scheme == "https" and parsed.hostname:
        return True
    return parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}


def _sign(user_id: str, stamp: str, nonce: str) -> str:
    key = hashlib.sha256(("meta-state|" + _get_encryption_secret()).encode()).digest()
    return hmac.new(key, f"{user_id}|{stamp}|{nonce}".encode(), hashlib.sha256).hexdigest()[:32]


def make_state(user_id: str, now: float | None = None) -> str:
    stamp, nonce = str(int(now if now is not None else time.time())), secrets.token_urlsafe(9)
    return f"{stamp}.{nonce}.{_sign(user_id, stamp, nonce)}"


def check_state(state: str, user_id: str, now: float | None = None) -> bool:
    try:
        stamp, nonce, sig = (state or "").split(".")
        age = (now if now is not None else time.time()) - int(stamp)
    except ValueError:
        return False
    return 0 <= age <= STATE_TTL and hmac.compare_digest(sig, _sign(user_id, stamp, nonce))


def login_url(app_id: str, redirect_uri: str, state: str) -> str:
    query = urlencode({"client_id": app_id, "redirect_uri": redirect_uri, "state": state,
                       "scope": ",".join(SCOPES), "response_type": "code", "auth_type": "rerequest"})
    return f"https://www.facebook.com/{GRAPH_VERSION}/dialog/oauth?{query}"


async def _get(client: httpx.AsyncClient, path: str, params: dict[str, str]) -> dict[str, Any]:
    r = await client.get(f"{GRAPH}/{GRAPH_VERSION}/{path}", params=params)
    data = r.json() if r.content else {}
    if r.status_code >= 400 or (isinstance(data, dict) and "error" in data):
        raise ValueError(_graph_error(data, r.status_code))
    return data


async def list_pages(token: str, client: httpx.AsyncClient) -> list[dict[str, str]]:
    """Páginas que a pessoa gerencia, cada uma com o próprio token."""
    pages: list[dict[str, str]] = []
    params = {"fields": "id,name,access_token,tasks", "limit": "100", "access_token": token}
    data = await _get(client, "me/accounts", params)
    for _ in range(10):
        for item in data.get("data") or []:
            if item.get("id") and item.get("access_token"):
                pages.append({"id": str(item["id"]), "name": str(item.get("name") or ""), "token": str(item["access_token"]),
                              "can_post": "CREATE_CONTENT" in (item.get("tasks") or ["CREATE_CONTENT"])})
        after = ((data.get("paging") or {}).get("cursors") or {}).get("after")
        if not after or not (data.get("paging") or {}).get("next"):
            break
        data = await _get(client, "me/accounts", {**params, "after": after})
    return pages


async def exchange(code: str, redirect_uri: str, client: httpx.AsyncClient | None = None) -> dict[str, Any]:
    """Troca o código do login por um token de 60 dias e devolve a pessoa e as páginas dela."""
    app = meta_app()
    if not app:
        raise ValueError("O app da Meta ainda não foi configurado")
    app_id, secret = app
    own = client is None
    client = client or httpx.AsyncClient(timeout=25)
    try:
        short = await _get(client, "oauth/access_token", {"client_id": app_id, "client_secret": secret, "redirect_uri": redirect_uri, "code": code})
        long = await _get(client, "oauth/access_token", {"grant_type": "fb_exchange_token", "client_id": app_id, "client_secret": secret,
                                                         "fb_exchange_token": str(short.get("access_token") or "")})
        token = str(long.get("access_token") or short.get("access_token") or "")
        if not token:
            raise ValueError("O Facebook não devolveu o acesso")
        me = await _get(client, "me", {"fields": "id,name", "access_token": token})
        return {"user": {"id": str(me.get("id") or ""), "name": str(me.get("name") or "")}, "token": token, "pages": await list_pages(token, client)}
    finally:
        if own:
            await client.aclose()


async def pages_of(token: str) -> list[dict[str, str]]:
    async with httpx.AsyncClient(timeout=25) as client:
        return await list_pages(token, client)


_LANG_WORDS = {
    "pt-BR": {"que", "não", "nao", "você", "voce", "para", "com", "uma", "mais", "como", "isso", "seu", "sua", "está", "esta", "dos", "das", "muito", "também", "hoje", "nossa", "nosso", "pra", "são"},
    "en": {"the", "and", "you", "your", "that", "this", "with", "for", "are", "why", "how", "what", "have", "from", "more", "will", "our", "can", "when", "about"},
    "es": {"que", "los", "las", "una", "para", "con", "por", "más", "como", "pero", "sus", "muy", "también", "hoy", "nuestra", "nuestro", "usted", "está", "el", "del"},
}


def guess_language(texts: list[str]) -> str | None:
    """Idioma mais provável dos posts da página (pt-BR, en ou es). None quando não dá para saber."""
    words = "".join(c if c.isalpha() else " " for c in " ".join(texts).lower()).split()
    if len(words) < 8:
        return None
    score = {lang: sum(1 for w in words if w in vocab) for lang, vocab in _LANG_WORDS.items()}
    best = max(score, key=lambda k: score[k])
    others = sorted(score.values(), reverse=True)
    return best if score[best] >= 3 and score[best] > others[1] else None


async def page_stats(page_id: str, token: str, client: httpx.AsyncClient) -> dict[str, Any]:
    """Números reais da página: seguidores, posts normais (texto e imagem), vídeos e programados.

    Traz também o que dá para ver sem ninguém preencher: se tem foto e capa, a categoria e o idioma dos posts."""
    info = await _get(client, page_id, {"fields": "followers_count,category,cover,picture{is_silhouette}", "access_token": token})
    normal = video = 0
    texts: list[str] = []
    fields = {"fields": "status_type,message", "limit": "100", "access_token": token}
    data = await _get(client, f"{page_id}/published_posts", fields)
    for _ in range(10):
        for item in data.get("data") or []:
            if item.get("status_type") == "added_video":
                video += 1
            else:
                normal += 1
            if item.get("message") and len(texts) < 40:
                texts.append(str(item["message"])[:400])
        after = ((data.get("paging") or {}).get("cursors") or {}).get("after")
        if not after or not (data.get("paging") or {}).get("next"):
            break
        data = await _get(client, f"{page_id}/published_posts", {**fields, "after": after})
    scheduled = await _get(client, f"{page_id}/scheduled_posts", {"fields": "id", "limit": "100", "access_token": token})
    followers = info.get("followers_count")
    picture = (info.get("picture") or {}).get("data") or {}
    return {"followers": int(followers) if isinstance(followers, int) else None, "normal": normal, "video": video,
            "scheduled": len(scheduled.get("data") or []),
            "has_photo": bool(picture) and picture.get("is_silhouette") is False, "has_cover": bool(info.get("cover")),
            "category": str(info.get("category") or "")[:80], "language": guess_language(texts)}


def same_name(a: str, b: str) -> bool:
    def norm(s: str) -> str:
        return " ".join((s or "").lower().split())
    return bool(norm(a)) and norm(a) == norm(b)



def _plain(value: str) -> str:
    base = unicodedata.normalize("NFKD", value or "")
    return "".join(c for c in base if not unicodedata.combining(c)).lower()


def match_offer(message: str, offers: list[dict[str, Any]]) -> tuple[str, str]:
    """Acha a palavra-chave de uma oferta dentro do comentário. Devolve (palavra, produto)."""
    words = set("".join(c if c.isalnum() else " " for c in _plain(message)).split())
    for offer in offers:
        key = _plain(str(offer.get("keyword") or "")).strip()
        if key and key in words:
            return str(offer["keyword"]).strip(), str(offer.get("product") or offer.get("name") or "").strip()
    return "", ""


async def page_comments(page_id: str, token: str, client: httpx.AsyncClient) -> list[dict[str, str]]:
    """Comentários dos 25 posts mais recentes da página (até 100 por post)."""
    data = await _get(client, f"{page_id}/published_posts", {"fields": "id,comments.limit(100){id,from,message,created_time}", "limit": "25", "access_token": token})
    out: list[dict[str, str]] = []
    for post in data.get("data") or []:
        for c in ((post.get("comments") or {}).get("data") or []):
            who = c.get("from") or {}
            if not c.get("id") or str(who.get("id") or "") == str(page_id):
                continue
            out.append({"id": str(c["id"]), "post_id": str(post.get("id") or ""), "from_id": str(who.get("id") or ""), "from_name": str(who.get("name") or ""),
                        "message": str(c.get("message") or ""), "created_time": str(c.get("created_time") or "")})
    return out


def _when(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S%z")
    except ValueError:
        return None


async def save_comments(db: AsyncSession, user_id: str, page_id: str, comments: list[dict[str, str]]) -> int:
    offers = [dict(r) for r in (await db.execute(text("SELECT name, product, keyword FROM offers WHERE user_id = :u AND keyword <> ''"), {"u": user_id})).mappings().all()]
    new = 0
    for c in comments:
        keyword, product = match_offer(c["message"], offers)
        result = await db.execute(text("""INSERT INTO fb_comments (id, user_id, page_id, fb_comment_id, fb_post_id, from_id, from_name, message, keyword, product, commented_at)
            VALUES (:id, :u, :p, :cid, :pid, :fid, :fname, :msg, :k, :prod, :at) 
            ON CONFLICT (fb_comment_id) DO UPDATE SET
              from_id = CASE WHEN EXCLUDED.from_id <> '' THEN EXCLUDED.from_id ELSE fb_comments.from_id END,
              from_name = CASE WHEN EXCLUDED.from_name <> '' THEN EXCLUDED.from_name ELSE fb_comments.from_name END,
              keyword = CASE WHEN fb_comments.keyword = '' THEN EXCLUDED.keyword ELSE fb_comments.keyword END,
              product = CASE WHEN fb_comments.keyword = '' THEN EXCLUDED.product ELSE fb_comments.product END
            RETURNING (xmax = 0) AS inserted"""),
            {"id": str(uuid.uuid4()), "u": user_id, "p": page_id, "cid": c["id"][:80], "pid": c["post_id"][:80], "fid": c["from_id"][:40], "fname": c["from_name"][:160],
             "msg": c["message"][:1000], "k": keyword[:30], "prod": product[:200], "at": _when(c["created_time"])})
        new += 1 if result.scalar() else 0
    return new


async def sync_page(db: AsyncSession, row: Any, client: httpx.AsyncClient, fresh: bool = False) -> None:
    """Lê do Facebook os números e os comentários de uma página conectada.

    Marca sozinho a foto, a capa e o nicho quando o Facebook mostra; em página recém-mapeada (fresh) define o idioma."""
    token = decrypt_setting_value(row["meta_token_enc"])
    st = await page_stats(row["meta_page_id"], token, client)
    await db.execute(text("""UPDATE fb_pages SET fb_followers = :f, fb_posts_normal = :n, fb_posts_video = :v, fb_scheduled = :s, fb_synced_at = NOW(),
        has_photo = has_photo OR :photo, has_cover = has_cover OR :cover,
        niche = CASE WHEN niche = '' THEN :cat ELSE niche END WHERE id = :id"""),
        {"f": st["followers"], "n": st["normal"], "v": st["video"], "s": st["scheduled"], "id": row["id"],
         "photo": bool(st.get("has_photo")), "cover": bool(st.get("has_cover")), "cat": str(st.get("category") or "")[:80]})
    if fresh:
        await db.execute(text("UPDATE fb_pages SET language = :l WHERE id = :id"), {"l": st.get("language") or "pt-BR", "id": row["id"]})
    try:
        await save_comments(db, row["user_id"], row["id"], await page_comments(row["meta_page_id"], token, client))
    except ValueError:  # sem a permissão de ler comentários: os números seguem valendo
        pass


async def refresh_stale_stats(db: AsyncSession, limit: int = 8, hours: int = 6) -> int:
    """Roda no worker: relê números e comentários das páginas conectadas, a cada 6 horas."""
    rows = (await db.execute(text("""SELECT id, user_id, meta_page_id, meta_token_enc FROM fb_pages
        WHERE meta_token_enc IS NOT NULL AND meta_page_id IS NOT NULL
          AND (fb_synced_at IS NULL OR fb_synced_at < NOW() - make_interval(hours => :h))
        ORDER BY fb_synced_at NULLS FIRST LIMIT :n"""), {"h": hours, "n": limit})).mappings().all()
    done = 0
    async with httpx.AsyncClient(timeout=25) as client:
        for row in rows:
            try:
                await sync_page(db, row, client)
                done += 1
            except Exception:  # noqa: BLE001 - tenta de novo daqui a 6 horas
                await db.execute(text("UPDATE fb_pages SET fb_synced_at = NOW() WHERE id = :id"), {"id": row["id"]})
    await db.commit()
    return done
