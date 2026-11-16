"""Analisar página: os posts públicos de uma Página do Facebook com o engajamento público de cada um.

Tudo vem da Graph API oficial. Nada é lido da tela do Facebook. Hoje funciona com as páginas
conectadas (o token da própria página); para páginas de terceiros a Meta exige o recurso
Page Public Content Access aprovado no app, e enquanto ele não sai a resposta explica isso.
Só Páginas: perfil pessoal não é lido.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from .clipspy import GRAPH, GRAPH_VERSION

PAGE_FIELDS = "id,name,link,fan_count,followers_count,category,picture.type(large){url}"
POST_FIELDS = ("id,message,created_time,permalink_url,full_picture,shares,"
               "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),attachments.limit(1){media_type}")
SEARCH_FIELDS = "id,name,link,fan_count,verification_status,picture{url}"
MAX_POSTS = 50
FB_HOSTS = ("facebook.com", "fb.com", "fb.me")
# Primeiro pedaço do endereço que não é nome de página.
NOT_A_PAGE = {"watch", "reel", "reels", "groups", "events", "marketplace", "share", "photo", "photo.php", "story.php",
              "permalink.php", "videos", "hashtag", "ads", "gaming", "login", "help", "stories", "sharer", "sharer.php",
              "dialog", "plugins", "business", "policies", "settings", "messages", "notifications", "search"}
NEEDS_FEATURE = ("A Meta ainda não liberou para o app a leitura de páginas de terceiros (Page Public Content Access). "
                 "Por enquanto a análise funciona com as páginas conectadas em Facebook.")
ORDERS = ("engajamento", "recentes", "comentarios", "compartilhamentos")


class PageAccessError(ValueError):
    """Recusa do Facebook, já com a mensagem para a tela. needs_feature: falta o recurso aprovado no app."""

    def __init__(self, message: str, *, needs_feature: bool = False, expired: bool = False) -> None:
        super().__init__(message)
        self.needs_feature = needs_feature
        self.expired = expired


def parse_page_ref(value: Any) -> dict[str, str]:
    """O que a pessoa digitou vira {"kind": "id" | "username" | "name", "value": ...}. Levanta ValueError com a mensagem para a tela."""
    text = " ".join(str(value or "").split())
    if not text:
        raise ValueError("Escreva o nome da página ou cole o endereço dela")
    if len(text) > 300:
        raise ValueError("Endereço longo demais. Cole só o endereço da página")
    looks_like_link = "://" in text or re.match(r"^(www\.|m\.)?(facebook|fb)\.(com|me)/", text, re.IGNORECASE)
    if looks_like_link:
        parsed = urlparse(text if "://" in text else f"https://{text}")
        host = re.sub(r"^(www|m|web|mbasic|business)\.", "", parsed.netloc.lower())
        if host not in FB_HOSTS:
            raise ValueError("Cole o endereço de uma página do Facebook")
        parts = [p for p in parsed.path.split("/") if p]
        query = parse_qs(parsed.query)
        if parts and parts[0] == "profile.php" and query.get("id") and query["id"][0].isdigit():
            return {"kind": "id", "value": query["id"][0]}
        if len(parts) >= 3 and parts[0] in ("people", "pages") and parts[-1].isdigit():
            return {"kind": "id", "value": parts[-1]}
        if len(parts) >= 2 and parts[0] == "p":
            tail = re.search(r"(\d{6,})$", parts[1])
            if tail:
                return {"kind": "id", "value": tail.group(1)}
        if not parts or parts[0].lower() in NOT_A_PAGE:
            raise ValueError("Esse endereço é de um post ou de outra área do Facebook. Cole o endereço da página")
        text = parts[0]
        if text.isdigit():
            return {"kind": "id", "value": text}
        if not re.fullmatch(r"[A-Za-z0-9.\-]{2,80}", text):
            raise ValueError("Não reconheci a página nesse endereço. Cole o endereço como aparece no navegador")
        return {"kind": "username", "value": text}
    if text.isdigit() and len(text) >= 5:
        return {"kind": "id", "value": text}
    if text.startswith("@") and re.fullmatch(r"@[A-Za-z0-9.\-]{2,80}", text):
        return {"kind": "username", "value": text[1:]}
    return {"kind": "name", "value": text[:80]}


def _count(node: Any) -> int:
    if isinstance(node, dict):
        summary = node.get("summary")
        if isinstance(summary, dict):
            return int(summary.get("total_count") or 0)
        return int(node.get("count") or 0)
    return 0


def post_row(item: dict[str, Any]) -> dict[str, Any]:
    """Um post com o engajamento público. Não guarda quem reagiu nem quem comentou, só os totais."""
    media = ""
    attachments = (item.get("attachments") or {}).get("data") or []
    if attachments and isinstance(attachments[0], dict):
        media = str(attachments[0].get("media_type") or "")
    reactions, comments, shares = _count(item.get("reactions")), _count(item.get("comments")), _count(item.get("shares"))
    return {
        "id": str(item.get("id") or ""),
        "text": " ".join(str(item.get("message") or "").split())[:600],
        "created_at": str(item.get("created_time") or ""),
        "link": str(item.get("permalink_url") or "")[:400],
        "picture": str(item.get("full_picture") or "")[:600],
        "kind": {"video": "vídeo", "photo": "foto", "album": "fotos", "link": "link"}.get(media, "post"),
        "reactions": reactions, "comments": comments, "shares": shares,
        "engagement": reactions + comments + shares,
    }


def rank(posts: list[dict[str, Any]], order: str = "engajamento") -> list[dict[str, Any]]:
    """Ordena os posts. Engajamento = reações + comentários + compartilhamentos."""
    key = {"recentes": "created_at", "comentarios": "comments", "compartilhamentos": "shares"}.get(order, "engagement")
    return sorted(posts, key=lambda p: (p[key], p["created_at"]), reverse=True)


def page_row(data: dict[str, Any]) -> dict[str, Any]:
    picture = ((data.get("picture") or {}).get("data") or {}).get("url") or ""
    page_id = str(data.get("id") or "")
    return {
        "id": page_id, "name": str(data.get("name") or "")[:160],
        "link": str(data.get("link") or (f"https://www.facebook.com/{page_id}" if page_id else ""))[:400],
        "followers": int(data.get("followers_count") or data.get("fan_count") or 0),
        "category": str(data.get("category") or "")[:80], "picture": str(picture)[:600],
    }


def summary(posts: list[dict[str, Any]]) -> dict[str, Any]:
    """Média de engajamento da página e quantos posts passam de 3 vezes a média (o formato para olhar primeiro)."""
    if not posts:
        return {"posts": 0, "average": 0, "standouts": 0}
    values = sorted(p["engagement"] for p in posts)
    middle = values[len(values) // 2] if len(values) % 2 else (values[len(values) // 2 - 1] + values[len(values) // 2]) / 2
    base = max(1, round(middle))
    return {"posts": len(posts), "average": base, "standouts": sum(1 for p in posts if p["engagement"] >= 3 * base and p["engagement"] >= 30)}


def explain(body: Any, status: int) -> PageAccessError:
    err = body.get("error") if isinstance(body, dict) else None
    if not isinstance(err, dict):
        return PageAccessError(f"Erro {status} do Facebook")
    code, message = err.get("code"), str(err.get("message") or "")
    if code == 190:
        return PageAccessError("O acesso ao Facebook venceu. Conecte de novo em Facebook.", expired=True)
    if "Page Public Content Access" in message or "Page Public Metadata Access" in message or code == 10:
        return PageAccessError(NEEDS_FEATURE, needs_feature=True)
    if code in (803, 100) and ("does not exist" in message or "alias" in message.lower() or "Unsupported get request" in message):
        return PageAccessError("Não encontrei essa página, ou ela não é pública. Confira o endereço. Perfil pessoal não é lido, só Página.")
    if code in (4, 17, 32, 613):
        return PageAccessError("O Facebook pediu uma pausa por excesso de consultas. Tente de novo em alguns minutos.")
    return PageAccessError((str(err.get("error_user_msg") or "") or message or f"Erro {status} do Facebook")[:300])


async def _get(client: httpx.AsyncClient, path: str, params: dict[str, str]) -> dict[str, Any]:
    response = await client.get(f"{GRAPH}/{GRAPH_VERSION}/{path}", params=params)
    data = response.json() if response.content else {}
    if response.status_code >= 400 or (isinstance(data, dict) and "error" in data):
        raise explain(data, response.status_code)
    return data


async def page_info(ref: str, token: str, client: httpx.AsyncClient) -> dict[str, Any]:
    """Dados públicos da página pelo id ou pelo nome de usuário."""
    return page_row(await _get(client, ref, {"fields": PAGE_FIELDS, "access_token": token}))


async def find_pages(name: str, token: str, client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Busca de páginas pelo nome (a Meta só libera com o recurso aprovado)."""
    data = await _get(client, "pages/search", {"q": name, "fields": SEARCH_FIELDS, "limit": "8", "access_token": token})
    out = []
    for item in data.get("data") or []:
        if item.get("id"):
            out.append({"id": str(item["id"]), "name": str(item.get("name") or "")[:160], "link": str(item.get("link") or "")[:400],
                        "followers": int(item.get("fan_count") or 0), "verified": str(item.get("verification_status") or "") == "blue_verified",
                        "picture": str(((item.get("picture") or {}).get("data") or {}).get("url") or "")[:600]})
    return out


async def page_posts(page_id: str, token: str, client: httpx.AsyncClient, limit: int = 25) -> list[dict[str, Any]]:
    data = await _get(client, f"{page_id}/posts", {"fields": POST_FIELDS, "limit": str(max(1, min(limit, MAX_POSTS))), "access_token": token})
    return [row for row in (post_row(item) for item in data.get("data") or [] if isinstance(item, dict)) if row["id"]]
