"""Módulo Facebook (em construção): contas, verificação, páginas, diário e posts dos cortes.

Só administradores por enquanto. Cada pessoa vê apenas as próprias contas e páginas.
O conector local (no computador da pessoa) abre os perfis do Dolphin/AdsPower/DICloak e
manda a lista de perfis para cá; o resto (agenda, publicação pela Meta) roda no servidor.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

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
)
from ...runtime_settings import decrypt_setting_value, encrypt_setting_value

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/facebook", tags=["facebook"])

PROVIDERS = ("dolphin", "adspower", "dicloak", "manual")
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
        item["todos"] = [_row(t) for t in todos if t["page_id"] == p["id"]]
        item["events"] = [_row(e) for e in events if e["page_id"] == p["id"]][:15]
        out_pages.append(item)
    out_accounts = []
    for a in accounts:
        item = _row(a)
        item["age"] = account_age(a["account_created_on"])
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
    account_id = str(uuid.uuid4())
    await db.execute(text("""INSERT INTO fb_accounts (id, user_id, provider, name, proxy, email, account_created_on, notes)
        VALUES (:id, :u, 'manual', :name, :proxy, :email, :created, :notes)"""),
        {"id": account_id, "u": user_id, "name": name, "proxy": _s(body.get("proxy"), 200), "email": _s(body.get("email"), 200),
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
    if provider not in PROVIDERS[:3]:
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
    return {"clips": [_row(r) for r in rows]}


@router.post("/pages/{page_id}/clips")
async def add_clips(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    page = await _own(db, "fb_pages", page_id, user_id)
    body = await request.json()
    ids = [str(x) for x in (body.get("clip_ids") or []) if x][:60]
    if not ids:
        raise HTTPException(status_code=400, detail="Escolha pelo menos um corte")
    clips = (await db.execute(text("""
        SELECT c.id, c.task_id, c.file_path, c.hook_title, c.text FROM generated_clips c JOIN tasks t ON t.id = c.task_id
        WHERE t.user_id = :u AND c.id = ANY(:ids)
    """), {"u": user_id, "ids": ids})).mappings().all()
    order = {cid: i for i, cid in enumerate(ids)}
    clips = sorted(clips, key=lambda c: order.get(c["id"], 0))
    if not clips:
        raise HTTPException(status_code=404, detail="Cortes não encontrados")
    now = datetime.now(UTC)
    taken = [r[0] for r in (await db.execute(text("SELECT scheduled_at FROM fb_posts WHERE page_id = :p AND status IN ('pendente','agendado','publicado') AND scheduled_at > :d"),
                                              {"p": page_id, "d": now})).all()]
    per_day = int(body.get("posts_per_day") or page["posts_per_day"])
    times = plan_times(page_id, max(1, min(4, per_day)), len(clips), taken, now)
    for clip, when in zip(clips, times):
        await db.execute(text("""INSERT INTO fb_posts (id, user_id, page_id, kind, task_id, clip_id, file_path, title, caption, scheduled_at)
            VALUES (:id, :u, :p, 'video', :t, :c, :f, :title, :cap, :w)"""),
            {"id": str(uuid.uuid4()), "u": user_id, "p": page_id, "t": clip["task_id"], "c": clip["id"], "f": clip["file_path"],
             "title": _s(clip["hook_title"], 200) or "Corte", "cap": caption_for(clip["hook_title"], clip["text"]), "w": when})
    if times:
        last = times[len(clips) - 1 if len(times) >= len(clips) else -1].astimezone(BR).strftime("%d/%m")
        await add_event(db, user_id, f"{len(times)} {'corte do ClipGringa entrou' if len(times) == 1 else 'cortes do ClipGringa entraram'} na agenda, até {last}", page_id=page_id)
    await db.commit()
    return {"agendados": len(times), "primeiro": times[0].isoformat() if times else None}


@router.get("/pages/{page_id}/posts")
async def page_posts(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _admin(request, db)
    await _own(db, "fb_pages", page_id, user_id)
    rows = (await db.execute(text("""SELECT id, kind, task_id, clip_id, title, caption, scheduled_at, status, fb_post_id, error, attempts
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
