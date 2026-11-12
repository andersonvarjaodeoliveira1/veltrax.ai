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
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx

from .config import Config
from .facebook import GRAPH, GRAPH_VERSION, _graph_error
from .runtime_settings import _get_encryption_secret

SCOPES = ("pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management")
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


def same_name(a: str, b: str) -> bool:
    def norm(s: str) -> str:
        return " ".join((s or "").lower().split())
    return bool(norm(a)) and norm(a) == norm(b)
