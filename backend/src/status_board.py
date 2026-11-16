"""Quadro de status do administrador: acesso à Ad Library, referências manuais, permissões do app
da Meta e a saúde da leitura das páginas. Só lê; nunca devolve token nem chave."""
from __future__ import annotations

import logging
import time
from typing import Any, Awaitable, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# O que o ClipGringa usa em cada permissão (para a pessoa saber o que destrava o quê).
PERMISSION_USE: dict[str, str] = {
    "pages_show_list": "Listar as suas páginas",
    "pages_read_engagement": "Ler números e comentários das suas páginas",
    "pages_manage_posts": "Publicar e agendar posts",
    "pages_manage_metadata": "Ajustar a página e receber avisos (webhook)",
    "pages_read_user_content": "Ler comentários de quem comenta",
    "business_management": "Achar páginas que estão num Gerenciador de Negócios",
    "pages_messaging": "Mensagem privada: resposta a comentário e caixa de mensagens",
    "pages_manage_engagement": "Visualizações por vídeo (estatísticas de vídeo)",
    "read_insights": "Estatísticas das páginas e dos vídeos",
}
# Recursos que a Meta não lista por essa consulta: o estado fica no painel de desenvolvedores.
FEATURES = (("Page Public Content Access", "Analisar páginas públicas que você não administra"),)
CACHE_SECONDS = 300
_cache: dict[str, Any] = {}

GraphCall = Callable[[str, dict[str, str]], Awaitable[dict[str, Any]]]


def permission_rows(app_permissions: list[dict[str, Any]], granted: list[str]) -> list[dict[str, str]]:
    """Uma linha por permissão que o sistema usa: aprovada, pendente ou não pedida, e se o seu login concedeu."""
    by_name = {str(p.get("permission") or ""): str(p.get("status") or "") for p in app_permissions}
    rows: list[dict[str, str]] = []
    for name, use in PERMISSION_USE.items():
        status = by_name.get(name, "")
        rows.append({
            "name": name, "use": use,
            # live = aprovada na análise do app (vale para qualquer pessoa)
            # unapproved = só funciona para quem tem papel no app (você e testadores)
            "status": "aprovada" if status == "live" else "pendente" if status == "unapproved" else "nao_pedida",
            "granted": "sim" if name in granted else "nao",
        })
    return rows


async def meta_app_status(graph: GraphCall, token: str | None, app: tuple[str, str] | None) -> dict[str, Any]:
    """Permissões do app na Meta e o que o acesso em uso tem concedido."""
    if not app:
        return {"configured": False, "permissions": permission_rows([], []), "features": _features(),
                "error": "Falta o ID e a chave secreta do app da Meta em Configurações do sistema."}
    app_id, secret = app
    app_token = f"{app_id}|{secret}"
    out: dict[str, Any] = {"configured": True, "app_id": app_id, "features": _features(), "error": ""}
    listed: list[dict[str, Any]] = []
    granted: list[str] = []
    try:
        listed = list((await graph(f"{app_id}/permissions", {"access_token": app_token})).get("data") or [])
    except Exception as exc:  # noqa: BLE001 - o quadro mostra o motivo em vez de quebrar
        out["error"] = f"A Meta não devolveu as permissões do app: {str(exc)[:200]}"
    if token:
        try:
            data = (await graph("debug_token", {"input_token": token, "access_token": app_token})).get("data") or {}
            granted = [str(s) for s in (data.get("scopes") or [])]
        except Exception:  # noqa: BLE001 - sem isso, a coluna "no seu login" fica em branco
            granted = []
    out["permissions"] = permission_rows(listed, granted)
    out["others_live"] = sorted(str(p.get("permission")) for p in listed if p.get("status") == "live" and p.get("permission") not in PERMISSION_USE)
    return out


def _features() -> list[dict[str, str]]:
    return [{"name": name, "use": use, "status": "conferir_no_painel"} for name, use in FEATURES]


async def references_status(db: AsyncSession) -> dict[str, Any]:
    row = (await db.execute(text("""
        SELECT COUNT(*) FILTER (WHERE status <> 'arquivado') AS active,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE discovered_at > NOW() - INTERVAL '7 days') AS week,
               COUNT(DISTINCT user_id) AS people,
               MAX(discovered_at) AS last_at
        FROM creative_bank WHERE source = 'manual'"""))).mappings().first()
    return {"active": int(row["active"] or 0), "total": int(row["total"] or 0), "week": int(row["week"] or 0),
            "people": int(row["people"] or 0), "last_at": row["last_at"].isoformat() if row["last_at"] else None}


async def reading_status(db: AsyncSession) -> dict[str, Any]:
    """Saúde da leitura das páginas: quantas têm visualizações lidas e quais o Facebook está negando."""
    rows = (await db.execute(text("""
        SELECT p.name, p.views_error, p.fb_synced_at,
               (SELECT COUNT(*) FROM fb_video_stats s WHERE s.page_id = p.id) AS videos,
               (SELECT COUNT(*) FROM fb_video_stats s WHERE s.page_id = p.id AND s.views > 0) AS with_views
        FROM fb_pages p WHERE p.meta_token_enc IS NOT NULL AND p.meta_page_id IS NOT NULL ORDER BY p.name"""))).mappings().all()
    pages = [{"name": r["name"], "videos": int(r["videos"] or 0), "with_views": int(r["with_views"] or 0), "error": r["views_error"] or "",
              "synced_at": r["fb_synced_at"].isoformat() if r["fb_synced_at"] else None} for r in rows]
    videos = sum(p["videos"] for p in pages)
    with_views = sum(p["with_views"] for p in pages)
    if any(p["error"] for p in pages):
        verdict = "negado"  # o Facebook recusou as visualizações em pelo menos uma página
    elif with_views:
        verdict = "ok"  # visualizações chegando
    elif videos:
        verdict = "zerado"  # há vídeos lidos, todos com zero: ou é zero mesmo, ou o campo não está vindo
    else:
        verdict = "sem_videos"
    return {"verdict": verdict, "pages": pages, "connected": len(pages), "videos": videos, "with_views": with_views}


async def build(db: AsyncSession, *, graph: GraphCall | None = None, now: float | None = None, fresh: bool = False) -> dict[str, Any]:
    from . import adlib_auth

    now = time.time() if now is None else now
    meta = _cache.get("meta")
    if fresh or not meta or now - float(_cache.get("meta_at") or 0) > CACHE_SECONDS:
        meta = await meta_app_status(graph or adlib_auth._graph_get, adlib_auth.current_token(), adlib_auth.app_credentials())
        _cache.update(meta=meta, meta_at=now)
    from .facebook_inbox import WEBHOOK_PATH, inbox_status, verify_token

    inbox = await inbox_status(db)
    # A frase de verificação e o endereço são o que se cola no painel da Meta (Webhooks, objeto Page).
    inbox.update(path=WEBHOOK_PATH, verify_token=verify_token())
    from . import reviewer

    return {"adlib": adlib_auth.snapshot(now), "references": await references_status(db), "meta_app": meta,
            "reading": await reading_status(db), "inbox": inbox, "reviewer": await reviewer.status(db), "generated_at": int(now)}
