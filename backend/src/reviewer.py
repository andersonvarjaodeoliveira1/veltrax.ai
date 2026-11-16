"""Conta de demonstração para o revisor da Meta (análise do app).

O administrador escolhe, em Admin, Configurações, o e-mail de UMA conta e as páginas de exemplo.
Essa conta passa a ver, em ClipSpy, Analisar página, as páginas de exemplo (as conectadas de um
administrador) e nasce com algumas referências salvas a partir dos posts delas, para o revisor
ver a função em uso sem depender de nada. Os tokens das páginas nunca saem do servidor: a conta
só dispara a leitura dos posts públicos, como qualquer análise.

Sem e-mail configurado, nada aqui tem efeito.
"""
from __future__ import annotations

import json
import logging
import re
import time
import uuid
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Config

logger = logging.getLogger(__name__)

MAX_PAGES = 5          # páginas de exemplo mostradas ao revisor
SEED_PER_PAGE = 2      # referências criadas por página
SEED_RETRY_SECONDS = 600
_last_seed_try: dict[str, float] = {}

INSERT_REFERENCE = """
    INSERT INTO creative_bank
      (id, user_id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status)
    VALUES
      (:id, :u, :src, :ext, :adv, :title, :link, '', :metrics, :score, :champ, :term, 'salvo')
    ON CONFLICT (user_id, source, external_id) DO UPDATE SET
      advertiser = EXCLUDED.advertiser, title = EXCLUDED.title, permalink = EXCLUDED.permalink,
      metrics = EXCLUDED.metrics, score = EXCLUDED.score, is_champion = EXCLUDED.is_champion, status = 'salvo'
    RETURNING id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status
"""


def reference_params(user_id: str, ref: dict[str, Any]) -> dict[str, Any]:
    return {"id": str(uuid.uuid4()), "u": user_id, "src": ref["source"], "ext": ref["external_id"], "adv": ref["advertiser"],
            "title": ref["title"], "link": ref["permalink"], "metrics": json.dumps(ref["metrics"]), "score": ref["score"],
            "champ": ref["is_champion"], "term": ref["term"]}


def reviewer_email() -> str:
    return (Config._get_runtime_setting("META_REVIEWER_EMAIL") or "").strip().lower()


def demo_names() -> list[str]:
    """Nomes das páginas de exemplo, como o administrador escreveu (separados por vírgula ou linha)."""
    raw = Config._get_runtime_setting("META_REVIEWER_PAGES") or ""
    return [name for name in (" ".join(part.split()) for part in re.split(r"[,;\n]", raw)) if name][:MAX_PAGES]


async def is_reviewer(db: AsyncSession, user_id: str) -> bool:
    email = reviewer_email()
    if not email:
        return False
    row = (await db.execute(text("SELECT LOWER(email) FROM users WHERE id = :u"), {"u": user_id})).first()
    return bool(row and row[0] == email)


def pick_pages(rows: list[dict[str, Any]], names: list[str]) -> list[dict[str, Any]]:
    """As páginas conectadas cujo nome está na lista, na ordem da lista, sem repetir."""
    def norm(value: str) -> str:
        return " ".join((value or "").lower().split())

    picked: list[dict[str, Any]] = []
    for name in names:
        match = next((r for r in rows if norm(r["name"]) == norm(name) and r not in picked), None)
        if match:
            picked.append(match)
    return picked[:MAX_PAGES]


async def demo_pages(db: AsyncSession) -> list[dict[str, Any]]:
    """Páginas de exemplo: conectadas por um administrador e listadas em META_REVIEWER_PAGES."""
    names = demo_names()
    if not names:
        return []
    rows = (await db.execute(text(
        "SELECT p.name, p.meta_page_id, p.meta_token_enc FROM fb_pages p JOIN users u ON u.id = p.user_id "
        "WHERE u.is_admin = TRUE AND p.meta_token_enc IS NOT NULL AND p.meta_page_id IS NOT NULL ORDER BY p.name"
    ))).mappings().all()
    return pick_pages([dict(r) for r in rows], names)


def seed_bodies(page_name: str, posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Os posts de mais engajamento da página viram referências (só os que têm texto e link). O primeiro entra como campeão."""
    usable = [p for p in posts if p.get("link") and p.get("text")]
    usable.sort(key=lambda p: (p.get("engagement") or 0, p.get("created_at") or ""), reverse=True)
    return [{"link": p["link"], "text": p["text"], "advertiser": page_name, "reactions": p.get("reactions") or 0,
             "comments": p.get("comments") or 0, "shares": p.get("shares") or 0, "champion": index == 0}
            for index, p in enumerate(usable[:SEED_PER_PAGE])]


async def seed_references(db: AsyncSession, user_id: str, client: httpx.AsyncClient | None = None, *, now: float | None = None) -> int:
    """Se a conta do revisor ainda não tem nenhuma referência, cria algumas a partir dos posts das páginas de exemplo.

    Roda no máximo uma vez a cada 10 minutos por conta e nunca derruba a tela: falha do Facebook só fica no log."""
    now = time.time() if now is None else now
    if now - _last_seed_try.get(user_id, 0.0) < SEED_RETRY_SECONDS:
        return 0
    _last_seed_try[user_id] = now
    existing = (await db.execute(text("SELECT COUNT(*) FROM creative_bank WHERE user_id = :u"), {"u": user_id})).scalar() or 0
    if existing:
        return 0
    from .clipspy_pages import PageAccessError, page_posts
    from .clipspy_references import manual_reference
    from .runtime_settings import decrypt_setting_value

    pages = await demo_pages(db)
    saved = 0
    own = client is None
    client = client or httpx.AsyncClient(timeout=20)
    try:
        for page in pages:
            try:
                posts = await page_posts(page["meta_page_id"], decrypt_setting_value(page["meta_token_enc"]), client)
            except (PageAccessError, httpx.HTTPError) as exc:
                logger.warning("conta do revisor: não li os posts de %s: %s", page["name"], exc)
                continue
            for body in seed_bodies(page["name"], posts):
                try:
                    ref = manual_reference(body)
                except ValueError:
                    continue
                await db.execute(text(INSERT_REFERENCE), reference_params(user_id, ref))
                saved += 1
        await db.commit()
    finally:
        if own:
            await client.aclose()
    if saved:
        logger.info("conta do revisor: %d referências de exemplo criadas", saved)
    return saved


async def status(db: AsyncSession) -> dict[str, Any]:
    """Para o painel de status: a conta existe? quantas referências tem? quais páginas de exemplo valem?"""
    email = reviewer_email()
    if not email:
        return {"configured": False, "exists": False, "references": 0, "pages": [], "missing_pages": demo_names()}
    row = (await db.execute(text("SELECT id FROM users WHERE LOWER(email) = :e"), {"e": email})).first()
    references = 0
    if row:
        references = int((await db.execute(text("SELECT COUNT(*) FROM creative_bank WHERE user_id = :u AND status <> 'arquivado'"), {"u": row[0]})).scalar() or 0)
    found = [p["name"] for p in await demo_pages(db)]
    known = {" ".join(n.lower().split()) for n in found}
    return {"configured": True, "exists": bool(row), "references": references, "pages": found,
            "missing_pages": [n for n in demo_names() if " ".join(n.lower().split()) not in known]}
