"""Módulo Facebook (em construção): contas, verificação, páginas, diário e posts dos cortes.

Só administradores por enquanto. Cada pessoa vê apenas as próprias contas e páginas.
O conector local (no computador da pessoa) abre os perfis do Dolphin/AdsPower/DICloak e
manda a lista de perfis para cá; o resto (agenda, publicação pela Meta) roda no servidor.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ... import facebook_meta as meta
from ...admin_auth import require_admin_user
from ...config import get_config
from ...database import get_db
from ...facebook import (
    ACCOUNT_STATUS,
    BR,
    PAGE_STATUS,
    add_event,
    caption_for,
    check_page_token,
    delete_remote,
    plan_times,
    publish_due,
    set_page_cover_file,
    set_page_picture_file,
)
from ...runtime_settings import decrypt_setting_value, encrypt_setting_value

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/facebook", tags=["facebook"])

PROVIDERS = ("dolphin", "adspower", "dicloak", "multilogin", "manual")
ANTIDETECT = PROVIDERS[:4]  # "manual" = navegador comum (Chrome, Edge…), sem antidetect


def protection_of(provider: str, proxy: str) -> str:
    """Como o perfil está protegido: navegador comum, antidetect com proxy ou antidetect sem proxy."""
    if provider not in ANTIDETECT:
        return "navegador"
    return "antidetect_proxy" if (proxy or "").strip() else "antidetect"
STATUS_LABEL = {"ativa": "ativa", "confirmacao": "pedindo confirmação", "restricao": "com restrição", "bloqueada": "bloqueada"}
MAX_ACCOUNTS = 300
MAX_PAGES = 300


async def _admin(request: Request, db: AsyncSession) -> str:
    return await require_admin_user(request, db, get_config())


def _s(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, (datetime, date)) else value


def _row(row: Any, drop: tuple[str, ...] = ()) -> dict[str, Any]:
    return {k: _iso(v) for k, v in dict(row).items() if k not in drop}


def _date(value: Any) -> date | None:
    raw = _s(value, 10)
    if not raw:
        return None
    try:
        if "/" in raw:
            d, m, y = raw.split("/")
            return date(int(y), int(m), int(d))
        return date.fromisoformat(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Data inválida. Use dd/mm/aaaa.")


def account_age(created: date | None, today: date | None = None) -> str:
    if not created:
        return ""
    today = today or datetime.now(BR).date()
    months = (today.year - created.year) * 12 + today.month - created.month - (1 if today.day < created.day else 0)
    if months < 1:
        days = max(0, (today - created).days)
        return f"{days} {'dia' if days == 1 else 'dias'}"
    years, rest = divmod(months, 12)
    plural = lambda n, a, b: f"{n} {a if n == 1 else b}"
    if not years:
        return plural(rest, "mês", "meses")
    return plural(years, "ano", "anos") + (f" e {plural(rest, 'mês', 'meses')}" if rest else "")


async def _own(db: AsyncSession, table: str, item_id: str, user_id: str) -> dict[str, Any]:
    row = (await db.execute(text(f"SELECT * FROM {table} WHERE id = :id AND user_id = :u"), {"id": item_id, "u": user_id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Não encontrado")
    return dict(row)


# ---------- visão geral ----------
@router.get("/overview")
async def overview(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    now = datetime.now(UTC)
    accounts = (await db.execute(text("""
        SELECT a.*, (SELECT COUNT(*) FROM fb_pages p WHERE p.account_id = a.id) AS pages
        FROM fb_accounts a WHERE a.user_id = :u ORDER BY a.created_at DESC
    """), {"u": user_id})).mappings().all()
    pages = (await db.execute(text("""
        SELECT p.*, a.name AS account_name,
          (SELECT COUNT(*) FROM fb_posts x WHERE x.page_id = p.id AND (x.status = 'publicado' OR (x.status = 'agendado' AND x.scheduled_at <= :now))) AS published,
          (SELECT COUNT(*) FROM fb_posts x WHERE x.page_id = p.id AND x.status IN ('pendente', 'agendado') AND x.scheduled_at > :now) AS upcoming,
          (SELECT COUNT(*) FROM fb_posts x WHERE x.page_id = p.id AND x.status = 'falhou') AS failed,
          (SELECT COUNT(*) FROM fb_posts x WHERE x.page_id = p.id AND x.status <> 'falhou' AND x.kind <> 'video') AS posts_normal,
          (SELECT COUNT(*) FROM fb_posts x WHERE x.page_id = p.id AND x.status <> 'falhou' AND x.kind = 'video' AND x.source = 'organico') AS videos_cta,
          (SELECT COUNT(*) FROM fb_posts x WHERE x.page_id = p.id AND x.status <> 'falhou' AND x.kind = 'video' AND x.source = 'corte') AS videos_cut,
          (SELECT COUNT(*) FROM fb_posts x WHERE x.page_id = p.id AND x.status <> 'falhou' AND x.kind = 'video' AND x.source = 'manual') AS videos_manual,
          (SELECT MIN(x.scheduled_at) FROM fb_posts x WHERE x.page_id = p.id AND x.status IN ('pendente', 'agendado') AND x.scheduled_at > :now) AS next_at,
          (SELECT MAX(x.scheduled_at) FROM fb_posts x WHERE x.page_id = p.id AND x.status IN ('pendente', 'agendado')) AS until_at
        FROM fb_pages p LEFT JOIN fb_accounts a ON a.id = p.account_id
        WHERE p.user_id = :u ORDER BY p.created_at DESC
    """), {"u": user_id, "now": now})).mappings().all()
    todos = (await db.execute(text("SELECT id, page_id, text, done_at, created_at FROM fb_todos WHERE user_id = :u AND (done_at IS NULL OR done_at > :since) ORDER BY created_at"),
                              {"u": user_id, "since": now.replace(hour=0, minute=0)})).mappings().all()
    events = (await db.execute(text("SELECT id, page_id, account_id, actor, text, created_at FROM fb_events WHERE user_id = :u ORDER BY created_at DESC LIMIT 300"), {"u": user_id})).mappings().all()
    out_pages = []
    for p in pages:
        item = _row(p, drop=("meta_token_enc",))
        item["meta_connected"] = bool(p["meta_token_enc"])
        item["ideas"] = _ideas_of(p)
        item["todos"] = [_row(t) for t in todos if t["page_id"] == p["id"]]
        item["events"] = [_row(e) for e in events if e["page_id"] == p["id"]][:15]
        out_pages.append(item)
    out_accounts = []
    for a in accounts:
        item = _row(a)
        item["age"] = account_age(a["account_created_on"])
        item["protection"] = protection_of(a["provider"], a["proxy"])
        item["events"] = [_row(e) for e in events if e["account_id"] == a["id"]][:8]
        out_accounts.append(item)
    return {"accounts": out_accounts, "pages": out_pages}


# ---------- contas ----------
@router.post("/accounts")
async def create_account(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    body = await request.json()
    name = _s(body.get("name"), 160)
    if not name:
        raise HTTPException(status_code=400, detail="Dê um nome para a conta")
    total = (await db.execute(text("SELECT COUNT(*) FROM fb_accounts WHERE user_id = :u"), {"u": user_id})).scalar() or 0
    if total >= MAX_ACCOUNTS:
        raise HTTPException(status_code=409, detail=f"Limite de {MAX_ACCOUNTS} contas")
    provider = _s(body.get("provider"), 20) or "manual"
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail="Navegador inválido")
    account_id = str(uuid.uuid4())
    await db.execute(text("""INSERT INTO fb_accounts (id, user_id, provider, name, proxy, email, account_created_on, notes)
        VALUES (:id, :u, :provider, :name, :proxy, :email, :created, :notes)"""),
        {"id": account_id, "u": user_id, "provider": provider, "name": name, "proxy": _s(body.get("proxy"), 200), "email": _s(body.get("email"), 200),
         "created": _date(body.get("account_created_on")), "notes": _s(body.get("notes"), 1000)})
    await add_event(db, user_id, f"Conta {name} adicionada", account_id=account_id, actor="voce")
    await db.commit()
    return {"id": account_id}


@router.post("/accounts/sync")
async def sync_accounts(request: Request, db: AsyncSession = Depends(get_db)):
    """Recebe a lista de perfis do navegador antidetect (lida pelo conector local) e espelha aqui."""
    user_id = await _admin(request, db)
    body = await request.json()
    provider = _s(body.get("provider"), 20)
    if provider not in ANTIDETECT:
        raise HTTPException(status_code=400, detail="Navegador inválido")
    profiles = body.get("profiles") if isinstance(body.get("profiles"), list) else []
    added = updated = 0
    for prof in profiles[:MAX_ACCOUNTS]:
        if not isinstance(prof, dict):
            continue
        ext, name = _s(prof.get("external_id"), 80), _s(prof.get("name"), 160)
        if not ext or not name:
            continue
        found = (await db.execute(text("SELECT id FROM fb_accounts WHERE user_id = :u AND provider = :p AND external_id = :e"), {"u": user_id, "p": provider, "e": ext})).scalar()
        if found:
            await db.execute(text("UPDATE fb_accounts SET name = :n, proxy = :x, updated_at = NOW() WHERE id = :id"), {"n": name, "x": _s(prof.get("proxy"), 200), "id": found})
            updated += 1
        else:
            account_id = str(uuid.uuid4())
            await db.execute(text("""INSERT INTO fb_accounts (id, user_id, provider, external_id, name, proxy, notes)
                VALUES (:id, :u, :p, :e, :n, :x, :notes)"""),
                {"id": account_id, "u": user_id, "p": provider, "e": ext, "n": name, "x": _s(prof.get("proxy"), 200), "notes": _s(prof.get("notes"), 1000)})
            await add_event(db, user_id, f"Conta {name} veio do {provider.capitalize()}", account_id=account_id)
            added += 1
    await db.commit()
    return {"novas": added, "atualizadas": updated}


@router.patch("/accounts/{account_id}")
async def update_account(account_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    current = await _own(db, "fb_accounts", account_id, user_id)
    body = await request.json()
    sets, params = [], {"id": account_id}
    for key, limit in (("name", 160), ("proxy", 200), ("email", 200), ("notes", 1000)):
        if key in body:
            sets.append(f"{key} = :{key}")
            params[key] = _s(body[key], limit)
    if "provider" in body and not current["external_id"]:
        # só contas cadastradas à mão trocam de navegador; as espelhadas seguem o perfil de origem
        provider = _s(body["provider"], 20)
        if provider not in PROVIDERS:
            raise HTTPException(status_code=400, detail="Navegador inválido")
        sets.append("provider = :provider")
        params["provider"] = provider
    if "account_created_on" in body:
        sets.append("account_created_on = :created")
        params["created"] = _date(body["account_created_on"])
    if "status" in body:
        status = _s(body["status"], 20)
        if status not in ACCOUNT_STATUS:
            raise HTTPException(status_code=400, detail="Situação inválida")
        reason = _s(body.get("status_reason"), 300)
        sets += ["status = :status", "status_reason = :reason", "status_changed_at = NOW()"]
        params |= {"status": status, "reason": reason}
        if status != current["status"]:
            await add_event(db, user_id, f"Verificação: conta {STATUS_LABEL[status]}" + (f", {reason}" if reason else ""), account_id=account_id, actor="voce")
            # conta fora de "ativa": o publicador segura os posts das páginas dela até voltar
    if sets:
        await db.execute(text(f"UPDATE fb_accounts SET {', '.join(sets)}, updated_at = NOW() WHERE id = :id"), params)
    await db.commit()
    return {"ok": True}


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    await _own(db, "fb_accounts", account_id, user_id)
    await db.execute(text("DELETE FROM fb_accounts WHERE id = :id"), {"id": account_id})
    await db.commit()
    return {"ok": True}


# ---------- páginas ----------
def _page_values(body: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, limit in (("name", 160), ("link", 400), ("niche", 80), ("language", 10)):
        if key in body:
            out[key] = _s(body[key], limit)
    if "posts_per_day" in body:
        try:
            out["posts_per_day"] = max(1, min(4, int(body["posts_per_day"])))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Posts por dia de 1 a 4")
    for key in ("has_photo", "has_cover"):
        if key in body:
            out[key] = bool(body[key])
    if "plan_seed" in body:
        try:
            out["plan_seed"] = max(0, min(10_000, int(body["plan_seed"])))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Sugestão inválida")
    if "status" in body:
        if body["status"] not in PAGE_STATUS:
            raise HTTPException(status_code=400, detail="Situação inválida")
        out["status"] = body["status"]
    return out


async def _check_account(db: AsyncSession, user_id: str, account_id: Any) -> str | None:
    if not account_id:
        return None
    await _own(db, "fb_accounts", str(account_id), user_id)
    return str(account_id)


@router.post("/pages")
async def create_page(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    body = await request.json()
    values = _page_values(body)
    if not values.get("name"):
        raise HTTPException(status_code=400, detail="Dê o nome da página")
    total = (await db.execute(text("SELECT COUNT(*) FROM fb_pages WHERE user_id = :u"), {"u": user_id})).scalar() or 0
    if total >= MAX_PAGES:
        raise HTTPException(status_code=409, detail=f"Limite de {MAX_PAGES} páginas")
    page_id = str(uuid.uuid4())
    values = {"link": "", "niche": "", "language": "en", "posts_per_day": 3, "has_photo": False, "has_cover": False, "status": "ativa", **values}
    await db.execute(text("""INSERT INTO fb_pages (id, user_id, account_id, name, link, niche, language, posts_per_day, has_photo, has_cover, status)
        VALUES (:id, :u, :a, :name, :link, :niche, :language, :posts_per_day, :has_photo, :has_cover, :status)"""),
        {"id": page_id, "u": user_id, "a": await _check_account(db, user_id, body.get("account_id")), **values})
    await add_event(db, user_id, f"Página {values['name']} entrou no painel", page_id=page_id, actor="voce")
    await db.commit()
    return {"id": page_id}


@router.patch("/pages/{page_id}")
async def update_page(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    current = await _own(db, "fb_pages", page_id, user_id)
    body = await request.json()
    values = _page_values(body)
    if "account_id" in body:
        values["account_id"] = await _check_account(db, user_id, body.get("account_id"))
    if values:
        await db.execute(text(f"UPDATE fb_pages SET {', '.join(f'{k} = :{k}' for k in values)}, updated_at = NOW() WHERE id = :id"), {"id": page_id, **values})
        labels = {"has_photo": "Foto do perfil", "has_cover": "Capa"}
        for key, label in labels.items():
            if key in values and values[key] != current[key]:
                await add_event(db, user_id, f"{label} {'colocada' if values[key] else 'removida'}", page_id=page_id, actor="voce")
        if "status" in values and values["status"] != current["status"]:
            await add_event(db, user_id, f"Página marcada como {values['status']}", page_id=page_id, actor="voce")
    await db.commit()
    return {"ok": True}


@router.delete("/pages/{page_id}")
async def delete_page(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    await _own(db, "fb_pages", page_id, user_id)
    await db.execute(text("DELETE FROM fb_pages WHERE id = :id"), {"id": page_id})
    await db.commit()
    return {"ok": True}


@router.post("/pages/{page_id}/meta")
async def connect_meta(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    await _own(db, "fb_pages", page_id, user_id)
    token = _s((await request.json()).get("token"), 1000)
    if len(token) < 20:
        raise HTTPException(status_code=400, detail="Cole o token da página")
    try:
        info = await check_page_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.execute(text("""UPDATE fb_pages SET meta_page_id = :mid, meta_token_enc = :tok, meta_connected_at = NOW(), meta_error = NULL,
        link = CASE WHEN link = '' THEN :link ELSE link END, updated_at = NOW() WHERE id = :id"""),
        {"mid": info["id"], "tok": encrypt_setting_value(token), "link": f"https://www.facebook.com/{info['id']}", "id": page_id})
    await add_event(db, user_id, f"Conectada à Meta ({info['name']}). A partir de agora o app agenda os posts sozinho", page_id=page_id, actor="voce")
    await db.commit()
    return {"page": info["name"]}


@router.delete("/pages/{page_id}/meta")
async def disconnect_meta(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    await _own(db, "fb_pages", page_id, user_id)
    await db.execute(text("UPDATE fb_pages SET meta_token_enc = NULL, meta_connected_at = NULL, updated_at = NOW() WHERE id = :id"), {"id": page_id})
    await add_event(db, user_id, "Desconectada da Meta", page_id=page_id, actor="voce")
    await db.commit()
    return {"ok": True}


MAX_PHOTO_BYTES = 8 * 1024 * 1024  # 8 MB por imagem


@router.post("/pages/{page_id}/photos")
async def apply_page_photos(
    page_id: str,
    request: Request,
    picture: UploadFile | None = File(default=None),
    cover: UploadFile | None = File(default=None),
    offset_y: int | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Troca a foto de perfil e/ou a capa de UMA página, com arquivos enviados do computador."""
    user_id = await _admin(request, db)
    page = await _own(db, "fb_pages", page_id, user_id)
    if not page.get("meta_token_enc") or not page.get("meta_page_id"):
        raise HTTPException(status_code=400, detail="Página não conectada à Meta")
    if picture is None and cover is None:
        raise HTTPException(status_code=400, detail="Envie a foto de perfil, a capa, ou as duas")

    token = decrypt_setting_value(page["meta_token_enc"])
    fb_id = str(page["meta_page_id"])
    feito: list[str] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=20)) as client:
        try:
            if picture is not None:
                data = await picture.read()
                if len(data) > MAX_PHOTO_BYTES:
                    raise HTTPException(status_code=400, detail="Foto de perfil acima de 8 MB")
                await set_page_picture_file(client, page_id=fb_id, token=token, data=data, filename=picture.filename or "perfil.jpg")
                await db.execute(text("UPDATE fb_pages SET has_photo = TRUE, updated_at = NOW() WHERE id = :id"), {"id": page_id})
                await add_event(db, user_id, "Foto do perfil trocada pela ferramenta", page_id=page_id, actor="voce")
                feito.append("perfil")
            if cover is not None:
                data = await cover.read()
                if len(data) > MAX_PHOTO_BYTES:
                    raise HTTPException(status_code=400, detail="Capa acima de 8 MB")
                await set_page_cover_file(client, page_id=fb_id, token=token, data=data, filename=cover.filename or "capa.jpg", offset_y=offset_y)
                await db.execute(text("UPDATE fb_pages SET has_cover = TRUE, updated_at = NOW() WHERE id = :id"), {"id": page_id})
                await add_event(db, user_id, "Capa trocada pela ferramenta", page_id=page_id, actor="voce")
                feito.append("capa")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    return {"ok": True, "feito": feito}


# ---------- entrar com o Facebook ----------
# Um clique: a pessoa entra, e o perfil e todas as páginas dele são mapeados e conectados sozinhos.
async def _attach_meta_page(db: AsyncSession, user_id: str, page_id: str, mp: dict[str, Any], who: str) -> None:
    await db.execute(text("""UPDATE fb_pages SET meta_page_id = :mid, meta_token_enc = :tok, meta_connected_at = NOW(), meta_error = NULL,
        link = CASE WHEN link = '' THEN :link ELSE link END, updated_at = NOW() WHERE id = :id"""),
        {"mid": mp["id"], "tok": encrypt_setting_value(mp["token"]), "link": f"https://www.facebook.com/{mp['id']}", "id": page_id})
    await add_event(db, user_id, f"Conectada à Meta pelo login de {who}. A partir de agora o app agenda os posts sozinho", page_id=page_id, actor="voce")


async def _account_for(db: AsyncSession, user_id: str, name: str) -> str:
    """Conta (perfil) com esse nome; se não existe, cria como navegador comum."""
    rows = (await db.execute(text("SELECT id, name FROM fb_accounts WHERE user_id = :u"), {"u": user_id})).mappings().all()
    found = next((r["id"] for r in rows if meta.same_name(r["name"], name)), None)
    if found:
        return found
    account_id = str(uuid.uuid4())
    await db.execute(text("INSERT INTO fb_accounts (id, user_id, provider, name) VALUES (:id, :u, 'manual', :n)"), {"id": account_id, "u": user_id, "n": name[:160]})
    await add_event(db, user_id, f"Perfil {name} mapeado pelo login do Facebook", account_id=account_id, actor="voce")
    return account_id


async def _map_profile(db: AsyncSession, user_id: str, who: str, account_id: str, fb_pages: list[dict[str, Any]]) -> dict[str, list[str]]:
    """Traz todas as páginas do perfil: liga as que já existem aqui, cria as que faltam e lê os números."""
    ours = [dict(r) for r in (await db.execute(text("SELECT id, name, meta_page_id, account_id, meta_token_enc FROM fb_pages WHERE user_id = :u"), {"u": user_id})).mappings().all()]
    out: dict[str, list[str]] = {"conectadas": [], "novas": [], "sem_permissao": []}
    total = len(ours)
    async with httpx.AsyncClient(timeout=25) as client:
        for mp in fb_pages:
            hit = next((p for p in ours if p["meta_page_id"] == mp["id"]), None) or next((p for p in ours if not p["meta_page_id"] and meta.same_name(p["name"], mp["name"])), None)
            if not hit:
                if total >= MAX_PAGES:
                    continue
                hit = {"id": str(uuid.uuid4()), "name": mp["name"], "meta_page_id": None, "account_id": account_id, "meta_token_enc": None}
                await db.execute(text("INSERT INTO fb_pages (id, user_id, account_id, name, language) VALUES (:id, :u, :a, :n, 'en')"),
                                 {"id": hit["id"], "u": user_id, "a": account_id, "n": mp["name"][:160]})
                await add_event(db, user_id, f"Página mapeada pelo login de {who}", page_id=hit["id"], actor="voce")
                ours.append(hit)
                total += 1
                out["novas"].append(mp["name"])
            if hit["meta_page_id"] == mp["id"] and mp["name"] and hit["name"] != mp["name"]:
                # o nome foi trocado no Facebook: o painel acompanha
                await db.execute(text("UPDATE fb_pages SET name = :n, updated_at = NOW() WHERE id = :id"), {"n": mp["name"][:160], "id": hit["id"]})
                await add_event(db, user_id, f"Nome trocado no Facebook: de {hit['name']} para {mp['name']}", page_id=hit["id"], actor="app")
                hit["name"] = mp["name"][:160]
            if hit["account_id"] != account_id:
                await db.execute(text("UPDATE fb_pages SET account_id = :a WHERE id = :id"), {"a": account_id, "id": hit["id"]})
            if not mp["can_post"]:
                await db.execute(text("UPDATE fb_pages SET meta_page_id = :m WHERE id = :id"), {"m": mp["id"], "id": hit["id"]})
                out["sem_permissao"].append(mp["name"])
                continue
            if hit["meta_page_id"] != mp["id"] or not hit["meta_token_enc"]:
                await _attach_meta_page(db, user_id, hit["id"], mp, who)
            else:
                await db.execute(text("UPDATE fb_pages SET meta_token_enc = :t, meta_error = NULL WHERE id = :id"), {"t": encrypt_setting_value(mp["token"]), "id": hit["id"]})
            hit["meta_page_id"] = mp["id"]
            if mp["name"] not in out["novas"]:
                out["conectadas"].append(hit["name"])
            try:
                await meta.sync_page(db, {"id": hit["id"], "user_id": user_id, "meta_page_id": mp["id"], "meta_token_enc": encrypt_setting_value(mp["token"])}, client, fresh=mp["name"] in out["novas"])
            except Exception as exc:  # noqa: BLE001 - números e comentários são um extra; o login não falha por causa deles
                logger.warning("Não li os números da página %s: %s", mp["id"], exc)
    return out


@router.get("/meta/status")
async def meta_status(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    rows = (await db.execute(text("""SELECT m.id, m.fb_user_name, m.connected_at, (SELECT COUNT(*) FROM fb_pages p WHERE p.account_id = m.account_id) AS pages
        FROM fb_meta_auth m WHERE m.user_id = :u ORDER BY m.connected_at"""), {"u": user_id})).mappings().all()
    return {"configured": meta.meta_app() is not None,
            "profiles": [{"id": r["id"], "name": r["fb_user_name"], "pages": r["pages"], "connected_at": _iso(r["connected_at"])} for r in rows]}


@router.post("/meta/start")
async def meta_start(request: Request, db: AsyncSession = Depends(get_db)):
    """Devolve o endereço do login do Facebook. A pessoa autoriza e volta para /facebook/meta."""
    user_id = await _admin(request, db)
    app = meta.meta_app()
    if not app:
        raise HTTPException(status_code=409, detail="O login com o Facebook ainda não está ativo")
    redirect_uri = _s((await request.json()).get("redirect_uri"), 300)
    if not meta.valid_redirect(redirect_uri):
        raise HTTPException(status_code=400, detail="Endereço de retorno inválido")
    return {"url": meta.login_url(app[0], redirect_uri, meta.make_state(user_id))}


@router.post("/meta/finish")
async def meta_finish(request: Request, db: AsyncSession = Depends(get_db)):
    """Recebe o código do login, guarda o acesso do perfil e mapeia o perfil e as páginas dele."""
    user_id = await _admin(request, db)
    body = await request.json()
    code, state, redirect_uri = _s(body.get("code"), 1000), _s(body.get("state"), 200), _s(body.get("redirect_uri"), 300)
    if not code or not meta.check_state(state, user_id):
        raise HTTPException(status_code=400, detail="O login expirou. Clique em Entrar com o Facebook de novo.")
    if not meta.valid_redirect(redirect_uri):
        raise HTTPException(status_code=400, detail="Endereço de retorno inválido")
    try:
        got = await meta.exchange(code, redirect_uri)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    who = (got["user"]["name"] or "Facebook")[:160]
    account_id = await _account_for(db, user_id, who)
    await db.execute(text("""INSERT INTO fb_meta_auth (id, user_id, fb_user_id, fb_user_name, account_id, token_enc, connected_at)
        VALUES (:id, :u, :fid, :fname, :a, :tok, NOW())
        ON CONFLICT (user_id, fb_user_id) DO UPDATE SET fb_user_name = :fname, account_id = :a, token_enc = :tok, connected_at = NOW()"""),
        {"id": str(uuid.uuid4()), "u": user_id, "fid": got["user"]["id"], "fname": who, "a": account_id, "tok": encrypt_setting_value(got["token"])})
    mapped = await _map_profile(db, user_id, who, account_id, got["pages"])
    await db.commit()
    return {"name": who, **mapped}


@router.post("/meta/sync")
async def meta_sync(request: Request, db: AsyncSession = Depends(get_db)):
    """Atualiza tudo: páginas novas de cada perfil conectado e os números de cada página."""
    user_id = await _admin(request, db)
    auths = (await db.execute(text("SELECT * FROM fb_meta_auth WHERE user_id = :u"), {"u": user_id})).mappings().all()
    if not auths:
        raise HTTPException(status_code=409, detail="Entre com o Facebook primeiro")
    total: dict[str, list[str]] = {"conectadas": [], "novas": [], "sem_permissao": []}
    expired: list[str] = []
    for auth in auths:
        try:
            pages = await meta.pages_of(decrypt_setting_value(auth["token_enc"]))
        except ValueError:
            expired.append(auth["fb_user_name"])
            continue
        account_id = auth["account_id"] or await _account_for(db, user_id, auth["fb_user_name"])
        part = await _map_profile(db, user_id, auth["fb_user_name"], account_id, pages)
        for key in total:
            total[key] += part[key]
    await db.commit()
    return {**total, "expirados": expired}


@router.delete("/meta/{auth_id}")
async def meta_forget(auth_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Esquece o login de um perfil. As páginas já conectadas continuam com o próprio token."""
    user_id = await _admin(request, db)
    await db.execute(text("DELETE FROM fb_meta_auth WHERE id = :id AND user_id = :u"), {"id": auth_id, "u": user_id})
    await db.commit()
    return {"ok": True}


@router.post("/pages/{page_id}/events")
async def note_event(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    await _own(db, "fb_pages", page_id, user_id)
    value = _s((await request.json()).get("text"), 400)
    if not value:
        raise HTTPException(status_code=400, detail="Escreva o que foi feito")
    await add_event(db, user_id, value, page_id=page_id, actor="voce")
    await db.commit()
    return {"ok": True}


@router.post("/pages/{page_id}/todos")
async def add_todo(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    await _own(db, "fb_pages", page_id, user_id)
    value = _s((await request.json()).get("text"), 400)
    if not value:
        raise HTTPException(status_code=400, detail="Escreva a tarefa")
    await db.execute(text("INSERT INTO fb_todos (id, user_id, page_id, text) VALUES (:id, :u, :p, :t)"), {"id": str(uuid.uuid4()), "u": user_id, "p": page_id, "t": value})
    await db.commit()
    return {"ok": True}


@router.patch("/todos/{todo_id}")
async def toggle_todo(todo_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    todo = await _own(db, "fb_todos", todo_id, user_id)
    done = bool((await request.json()).get("done", True))
    await db.execute(text("UPDATE fb_todos SET done_at = CASE WHEN :d THEN NOW() ELSE NULL END WHERE id = :id"), {"d": done, "id": todo_id})
    if done:
        await add_event(db, user_id, f"Feito à mão: {todo['text']}", page_id=todo["page_id"], actor="voce")
    await db.commit()
    return {"ok": True}


# ---------- ideias de temas (IA) ----------
LANG_NAME = {"en": "English", "pt-BR": "Brazilian Portuguese", "es": "Spanish", "fr": "French", "de": "German", "it": "Italian"}
MAX_IDEAS = 40


class _Idea(BaseModel):
    title: str = Field(description="Short theme title, 3 to 8 words")
    script: str = Field(description="What the narrator says in the video, 45 to 80 words, simple and accurate")
    caption: str = Field(description="Facebook caption: 1 or 2 sentences, a question to the audience and 3 hashtags")


class _Ideas(BaseModel):
    items: list[_Idea]


def _ideas_of(row: Any) -> list[dict[str, Any]]:
    try:
        raw = row["ideas"]
    except (KeyError, TypeError):
        raw = None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = []
    return raw if isinstance(raw, list) else []


def ideas_prompt(page: dict[str, Any], count: int) -> tuple[str, str]:
    lang = LANG_NAME.get(page.get("language") or "en", "English")
    used = [i.get("title", "") for i in _ideas_of(page)][-30:]
    system = (
        "You plan educational short videos for a Facebook page. Every fact must be true and widely accepted; "
        "never give medical, legal or financial advice, never promise results, and avoid controversial claims. "
        f"Write everything in {lang}."
    )
    prompt = (
        f"Page name: {page.get('name')}\nNiche: {page.get('niche') or 'curiosities'}\n"
        f"Give {count} different video themes that would make people stop scrolling, mixing subtopics of the niche. "
        "Each script opens with a hook in the first sentence and ends with one surprising detail."
        + (f"\nDo not repeat these themes: {'; '.join(used)}" if used else "")
    )
    return system, prompt


@router.post("/pages/{page_id}/ideas")
async def generate_ideas(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    page = await _own(db, "fb_pages", page_id, user_id)
    from ...integrations import load_user_keys
    from ...usage import get_balance, set_server_blocked, set_usage_user
    from .clone_plan import _run

    await load_user_keys(db, user_id)
    set_usage_user(user_id)
    set_server_blocked((await get_balance(db, user_id))["exhausted"])
    system, prompt = ideas_prompt(page, 12)
    result = await _run(system, _Ideas, prompt)
    new = [{"id": uuid.uuid4().hex[:10], "title": _s(i.title, 120), "script": _s(i.script, 1200), "caption": _s(i.caption, 600), "used": False}
           for i in result.items if i.title and i.script][:15]
    ideas = (_ideas_of(page) + new)[-MAX_IDEAS:]
    await db.execute(text("UPDATE fb_pages SET ideas = CAST(:i AS JSONB), updated_at = NOW() WHERE id = :id"), {"i": json.dumps(ideas, ensure_ascii=False), "id": page_id})
    await add_event(db, user_id, f"{len(new)} ideias de temas geradas", page_id=page_id)
    await db.commit()
    return {"ideas": ideas}


@router.patch("/pages/{page_id}/ideas/{idea_id}")
async def mark_idea(page_id: str, idea_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    page = await _own(db, "fb_pages", page_id, user_id)
    body = await request.json()
    ideas = _ideas_of(page)
    found = next((i for i in ideas if i.get("id") == idea_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Ideia não encontrada")
    if body.get("remove"):
        ideas = [i for i in ideas if i.get("id") != idea_id]
    else:
        found["used"] = bool(body.get("used", True))
    await db.execute(text("UPDATE fb_pages SET ideas = CAST(:i AS JSONB), updated_at = NOW() WHERE id = :id"), {"i": json.dumps(ideas, ensure_ascii=False), "id": page_id})
    await db.commit()
    return {"ideas": ideas}


# ---------- cortes do ClipGringa -> página ----------
@router.get("/clips")
async def recent_clips(request: Request, db: AsyncSession = Depends(get_db)):
    """Cortes prontos da pessoa, os mais novos primeiro, marcando os que já foram para alguma página."""
    user_id = await _admin(request, db)
    rows = (await db.execute(text("""
        SELECT c.id, c.task_id, c.hook_title, c.duration, c.virality_score, c.created_at, s.title AS source_title,
               (SELECT string_agg(DISTINCT g.name, ', ') FROM fb_posts x JOIN fb_pages g ON g.id = x.page_id WHERE x.clip_id = c.id AND x.user_id = :u) AS used_in
        FROM generated_clips c JOIN tasks t ON t.id = c.task_id LEFT JOIN sources s ON s.id = t.source_id
        WHERE t.user_id = :u ORDER BY c.created_at DESC, c.clip_order LIMIT 120
    """), {"u": user_id})).mappings().all()
    used = "(SELECT string_agg(DISTINCT g.name, ', ') FROM fb_posts x JOIN fb_pages g ON g.id = x.page_id WHERE x.clip_id = {} AND x.user_id = :u)"
    finals = (await db.execute(text(f"""
        SELECT f.id, f.created_at, f.duration, {used.format("f.id")} AS used_in FROM final_videos f
        WHERE f.user_id = :u AND f.status = 'done' AND f.path IS NOT NULL ORDER BY f.created_at DESC LIMIT 60
    """), {"u": user_id})).mappings().all()
    flows = (await db.execute(text(f"""
        SELECT v.id, v.created_at, v.package, v.file, {used.format("v.id")} AS used_in FROM flow_videos v
        WHERE v.user_id = :u AND v.deleted_at IS NULL AND lower(v.path) LIKE '%.mp4' ORDER BY v.created_at DESC LIMIT 60
    """), {"u": user_id})).mappings().all()
    videos = [{**_row(r), "source": "final", "title": "Vídeo final", "duration": r["duration"]} for r in finals]
    videos += [{"id": r["id"], "created_at": _iso(r["created_at"]), "used_in": r["used_in"], "source": "flow", "title": r["package"] or r["file"] or "Vídeo do Flow", "duration": None} for r in flows]
    return {"clips": [_row(r) for r in rows], "videos": videos}


@router.post("/pages/{page_id}/clips")
async def add_clips(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    page = await _own(db, "fb_pages", page_id, user_id)
    body = await request.json()
    ids = [str(x) for x in (body.get("clip_ids") or []) if x][:60]
    vids = [v for v in (body.get("videos") or []) if isinstance(v, dict) and v.get("id")][:60]
    if not ids and not vids:
        raise HTTPException(status_code=400, detail="Escolha pelo menos um vídeo")
    clips = [dict(c) for c in (await db.execute(text("""
        SELECT c.id, c.task_id, c.file_path, c.hook_title, c.text FROM generated_clips c JOIN tasks t ON t.id = c.task_id
        WHERE t.user_id = :u AND c.id = ANY(:ids)
    """), {"u": user_id, "ids": ids or [""]})).mappings().all()]
    order = {cid: i for i, cid in enumerate(ids)}
    clips = sorted(clips, key=lambda c: order.get(c["id"], 0))
    caption = _s(body.get("caption"), 3000)
    title = _s(body.get("title"), 200)
    for v in vids:
        if v.get("source") == "take":
            # take: corte inteligente de um vídeo final, já com headline própria
            row = (await db.execute(text("SELECT id, path, hook_title, text FROM video_takes WHERE id = :id AND user_id = :u"), {"id": str(v["id"]), "u": user_id})).mappings().first()
            if row and os.path.isfile(str(row["path"])):
                clips.append({"source": "take", "id": row["id"], "task_id": None, "file_path": row["path"],
                              "hook_title": title or _s(row.get("hook_title"), 200) or "Take", "text": row.get("text"),
                              "caption": caption_for(row.get("hook_title"), row.get("text")) if not caption else caption})
            continue
        if v.get("source") == "final":
            row = (await db.execute(text("SELECT id, path FROM final_videos WHERE id = :id AND user_id = :u AND status = 'done'"), {"id": str(v["id"]), "u": user_id})).mappings().first()
        else:
            row = (await db.execute(text("SELECT id, path, package FROM flow_videos WHERE id = :id AND user_id = :u AND deleted_at IS NULL"), {"id": str(v["id"]), "u": user_id})).mappings().first()
        if row:
            clips.append({"source": "organico", "id": row["id"], "task_id": None, "file_path": row["path"], "hook_title": title or _s(row.get("package"), 200) or "Vídeo orgânico", "text": None, "caption": caption})
    if not clips:
        raise HTTPException(status_code=404, detail="Cortes não encontrados")
    now = datetime.now(UTC)
    taken = [r[0] for r in (await db.execute(text("SELECT scheduled_at FROM fb_posts WHERE page_id = :p AND status IN ('pendente','agendado','publicado') AND scheduled_at > :d"),
                                              {"p": page_id, "d": now})).all()]
    per_day = int(body.get("posts_per_day") or page["posts_per_day"])
    times = plan_times(page_id, max(1, min(4, per_day)), len(clips), taken, now)
    for clip, when in zip(clips, times):
        await db.execute(text("""INSERT INTO fb_posts (id, user_id, page_id, kind, source, task_id, clip_id, file_path, title, caption, scheduled_at)
            VALUES (:id, :u, :p, 'video', :src, :t, :c, :f, :title, :cap, :w)"""),
            {"src": clip.get("source") or "corte", "id": str(uuid.uuid4()), "u": user_id, "p": page_id, "t": clip["task_id"], "c": clip["id"], "f": clip["file_path"],
             "title": _s(clip["hook_title"], 200) or "Corte", "cap": clip.get("caption") or caption_for(clip["hook_title"], clip["text"]), "w": when})
    if times:
        last = times[len(clips) - 1 if len(times) >= len(clips) else -1].astimezone(BR).strftime("%d/%m")
        await add_event(db, user_id, f"{len(times)} {'vídeo entrou' if len(times) == 1 else 'vídeos entraram'} na agenda, até {last}", page_id=page_id)
    await db.commit()
    return {"agendados": len(times), "primeiro": times[0].isoformat() if times else None}


@router.get("/pages/{page_id}/posts")
async def page_posts(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    await _own(db, "fb_pages", page_id, user_id)
    rows = (await db.execute(text("""SELECT id, kind, source, task_id, clip_id, title, caption, scheduled_at, status, fb_post_id, error, attempts
        FROM fb_posts WHERE page_id = :p ORDER BY scheduled_at DESC LIMIT 200"""), {"p": page_id})).mappings().all()
    return {"posts": [_row(r) for r in rows]}


@router.patch("/posts/{post_id}")
async def edit_post(post_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    post = await _own(db, "fb_posts", post_id, user_id)
    if post["status"] != "pendente":
        raise HTTPException(status_code=409, detail="Esse post já foi para o Facebook. Mude por lá.")
    body = await request.json()
    if "caption" in body:
        await db.execute(text("UPDATE fb_posts SET caption = :c, updated_at = NOW() WHERE id = :id"), {"c": _s(body["caption"], 5000), "id": post_id})
    await db.commit()
    return {"ok": True}


@router.get("/comments")
async def comments(request: Request, db: AsyncSession = Depends(get_db)):
    """Quem comentou, em qual página e perfil, e de qual produto (pela palavra-chave da oferta)."""
    user_id = await _admin(request, db)
    rows = (await db.execute(text("""SELECT c.id, c.from_name, c.message, c.keyword, c.product, c.commented_at, c.fb_post_id, c.page_id, c.dm_status, c.dm_error, c.dm_at,
            g.name AS page_name, a.name AS account_name
        FROM fb_comments c JOIN fb_pages g ON g.id = c.page_id LEFT JOIN fb_accounts a ON a.id = g.account_id
        WHERE c.user_id = :u ORDER BY c.commented_at DESC NULLS LAST LIMIT 500"""), {"u": user_id})).mappings().all()
    products = (await db.execute(text("""SELECT product, keyword, COUNT(*) AS total, COUNT(DISTINCT from_id) AS people FROM fb_comments
        WHERE user_id = :u AND keyword <> '' GROUP BY product, keyword ORDER BY total DESC"""), {"u": user_id})).mappings().all()
    total = (await db.execute(text("SELECT COUNT(*) FROM fb_comments WHERE user_id = :u"), {"u": user_id})).scalar() or 0
    return {"total": total, "products": [dict(p) for p in products], "comments": [_row(r) for r in rows]}


@router.get("/calendar")
async def calendar(request: Request, db: AsyncSession = Depends(get_db), days: int = 7):
    """Calendário da semana: o que vai sair em cada dia, em todas as páginas."""
    user_id = await _admin(request, db)
    days = max(1, min(31, days))
    start = datetime.now(BR).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (await db.execute(text("""SELECT x.id, x.page_id, g.name AS page_name, x.kind, x.source, x.title, x.scheduled_at, x.status
        FROM fb_posts x JOIN fb_pages g ON g.id = x.page_id
        WHERE x.user_id = :u AND x.scheduled_at >= :a AND x.scheduled_at < :b AND NOT (x.source = 'manual')
        ORDER BY x.scheduled_at LIMIT 600"""), {"u": user_id, "a": start, "b": start + timedelta(days=days)})).mappings().all()
    return {"start": start.date().isoformat(), "days": days, "posts": [_row(r) for r in rows]}


MANUAL_KINDS = {"texto": "só com texto", "imagem": "com imagem", "video": "em vídeo"}


@router.post("/pages/{page_id}/posts/manual")
async def register_manual_posts(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Registra posts feitos direto no Facebook, para os números da página baterem com a realidade."""
    user_id = await _admin(request, db)
    await _own(db, "fb_pages", page_id, user_id)
    body = await request.json()
    kind = _s(body.get("kind"), 10)
    if kind not in MANUAL_KINDS:
        raise HTTPException(status_code=400, detail="Tipo de post inválido")
    try:
        count = max(1, min(100, int(body.get("count") or 1)))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Quantidade inválida")
    now = datetime.now(UTC)
    for _ in range(count):
        await db.execute(text("""INSERT INTO fb_posts (id, user_id, page_id, kind, source, title, scheduled_at, status)
            VALUES (:id, :u, :p, :k, 'manual', :t, :w, 'publicado')"""),
            {"id": str(uuid.uuid4()), "u": user_id, "p": page_id, "k": kind, "t": f"Post {MANUAL_KINDS[kind]}, feito no Facebook", "w": now})
    await add_event(db, user_id, f"{count} {'post' if count == 1 else 'posts'} {MANUAL_KINDS[kind]} {'registrado' if count == 1 else 'registrados'}, feitos direto no Facebook", page_id=page_id, actor="voce")
    await db.commit()
    return {"registrados": count}


@router.get("/posts/{post_id}/file")
async def post_file(post_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Baixa o vídeo do post, para quem posta à mão (sem conectar à Meta)."""
    user_id = await _admin(request, db)
    post = await _own(db, "fb_posts", post_id, user_id)
    path = post["file_path"] or ""
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="O arquivo desse post não está mais disponível")
    ext = os.path.splitext(path)[1] or ".mp4"
    return FileResponse(path, filename=f"post-{post_id[:8]}{ext}")


@router.post("/posts/{post_id}/done")
async def post_done(post_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Postar à mão: a pessoa publicou ou programou direto no Facebook e marca aqui."""
    user_id = await _admin(request, db)
    post = await _own(db, "fb_posts", post_id, user_id)
    if post["status"] != "pendente":
        raise HTTPException(status_code=409, detail="Esse post já foi para o Facebook")
    await db.execute(text("UPDATE fb_posts SET status = 'publicado', error = NULL, updated_at = NOW() WHERE id = :id"), {"id": post_id})
    await add_event(db, user_id, f"Post \"{(post['title'] or 'sem título')[:80]}\" postado à mão no Facebook", page_id=post["page_id"], actor="voce")
    await db.commit()
    return {"ok": True}


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    post = await _own(db, "fb_posts", post_id, user_id)
    if post["status"] == "publicado":
        raise HTTPException(status_code=409, detail="Esse post já foi publicado. Apague pelo Facebook.")
    if post["status"] == "agendado" and post["fb_post_id"]:
        page = await _own(db, "fb_pages", post["page_id"], user_id)
        if page["meta_token_enc"]:
            try:
                await delete_remote(decrypt_setting_value(page["meta_token_enc"]), post["fb_post_id"])
            except Exception:  # noqa: BLE001 - se o Facebook recusar, o post sai daqui mesmo assim
                logger.warning("Não consegui tirar o post %s do Facebook", post["fb_post_id"])
    await db.execute(text("DELETE FROM fb_posts WHERE id = :id"), {"id": post_id})
    await add_event(db, user_id, f"Post tirado da agenda: {post['title']}", page_id=post["page_id"], actor="voce")
    await db.commit()
    return {"ok": True}


@router.post("/publish")
async def publish_now(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    return await publish_due(db, user_id=user_id)
