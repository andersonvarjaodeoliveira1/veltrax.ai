"""ClipSpy — radar de criativos vencedores (Fase 1: Meta Ad Library).

Busca anúncios ativos por termo, persiste no banco de criativos (creative_bank)
e serve a biblioteca para a tela de criação modelar os vencedores.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...clipspy import adlib_token, search_ad_library
from ...database import get_db
from .multiplier import _user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/clipspy", tags=["clipspy"])


@router.get("/status")
async def status(request: Request, db: AsyncSession = Depends(get_db)):
    """Diz se a Ad Library está configurada no servidor, sem nunca expor o token.

    A interface usa isso para mostrar a tela de configuracao em vez de disparar
    uma busca que falharia.
    """
    user_id = await _user_id(request, db)  # exige sessão válida
    out: dict[str, Any] = {"configured": adlib_token() is not None}
    from ...reviewer import is_reviewer

    if await is_reviewer(db, user_id):
        out["reviewer"] = True  # a tela mostra o passo a passo do revisor da Meta
    if await _is_admin(db, user_id):
        # Só o administrador vê a validade e a renovação (sem o valor do token).
        from ...adlib_auth import snapshot

        out["access"] = snapshot()
    return out


async def _is_admin(db: AsyncSession, user_id: str) -> bool:
    row = (await db.execute(text("SELECT is_admin FROM users WHERE id = :u"), {"u": user_id})).first()
    return bool(row and row[0])


async def _admin_id(request: Request, db: AsyncSession) -> str:
    """Sessão válida e de administrador: o ClipSpy é só do administrador."""
    user_id = await _user_id(request, db)
    if not await _is_admin(db, user_id):
        raise HTTPException(status_code=403, detail="Área só do administrador")
    return user_id


@router.post("/access/check")
async def check_access(request: Request, db: AsyncSession = Depends(get_db)):
    """Confere agora a validade do acesso à Ad Library e renova se for hora (só administrador)."""
    user_id = await _user_id(request, db)
    if not await _is_admin(db, user_id):
        raise HTTPException(status_code=403, detail="Só o administrador confere o acesso")
    from ...adlib_auth import tick
    from ...database import AsyncSessionLocal

    return {"configured": adlib_token() is not None, "access": await tick(AsyncSessionLocal, force=True)}

# A UE tem cobertura comercial completa na Ad Library (DSA); por isso o default.
DEFAULT_COUNTRIES = ["DE", "FR", "IT", "ES", "NL", "PT"]
MAX_LIMIT = 50


def _row(r: Any) -> dict[str, Any]:
    try:
        metrics = json.loads(r.metrics) if r.metrics else {}
    except (ValueError, TypeError):
        metrics = {}
    return {
        "id": r.id,
        "source": r.source,
        "external_id": r.external_id,
        "advertiser": r.advertiser or "",
        "title": r.title or "",
        "permalink": r.permalink or "",
        "thumbnail": r.thumbnail or "",
        "metrics": metrics,
        "score": float(r.score or 0),
        "is_champion": bool(r.is_champion),
        "term": r.term or "",
        "status": r.status,
    }


@router.post("/search")
async def search(request: Request, db: AsyncSession = Depends(get_db)):
    """Minera a Ad Library por um termo, salva no banco e devolve ordenado por tempo de veiculação."""
    user_id = await _admin_id(request, db)
    body = await request.json()
    term = str(body.get("term") or "").strip()
    if len(term) < 2:
        raise HTTPException(status_code=400, detail="Digite um termo de busca")
    countries = body.get("countries") or DEFAULT_COUNTRIES
    if not isinstance(countries, list) or not countries:
        countries = DEFAULT_COUNTRIES
    limit = min(int(body.get("limit") or 30), MAX_LIMIT)
    try:
        ads = await search_ad_library(term, [str(c) for c in countries], limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    results: list[dict[str, Any]] = []
    for ad in ads:
        if not ad["external_id"]:
            continue
        row = (await db.execute(text(
            """
            INSERT INTO creative_bank
              (id, user_id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status)
            VALUES
              (:id, :u, :src, :ext, :adv, :title, :link, :thumb, :metrics, :score, :champ, :term, 'novo')
            ON CONFLICT (user_id, source, external_id) DO UPDATE SET
              advertiser = EXCLUDED.advertiser, title = EXCLUDED.title, permalink = EXCLUDED.permalink,
              metrics = EXCLUDED.metrics, score = EXCLUDED.score, is_champion = EXCLUDED.is_champion, term = EXCLUDED.term
            RETURNING id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status
            """
        ), {
            "id": str(uuid.uuid4()), "u": user_id, "src": ad["source"], "ext": ad["external_id"],
            "adv": ad["advertiser"], "title": ad["title"], "link": ad["permalink"], "thumb": ad["thumbnail"],
            "metrics": json.dumps(ad["metrics"]), "score": ad["score"], "champ": ad["is_champion"], "term": term,
        })).first()
        if row:
            results.append(_row(row))
    await db.commit()
    return {"results": results, "count": len(results)}


@router.post("/references")
async def add_reference(request: Request, db: AsyncSession = Depends(get_db)):
    """Arquivo de referências manual: guarda um vídeo que a pessoa achou navegando, com o que ela anotou.

    Nada é lido do link pelo servidor. Colar o mesmo link de novo atualiza a referência."""
    user_id = await _admin_id(request, db)
    from ...clipspy_references import manual_reference

    try:
        ref = manual_reference(await request.json())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    from ...reviewer import INSERT_REFERENCE, reference_params

    row = (await db.execute(text(INSERT_REFERENCE), reference_params(user_id, ref))).first()
    await db.commit()
    return _row(row)


async def _connected_pages(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    rows = (await db.execute(text(
        "SELECT name, meta_page_id, meta_token_enc FROM fb_pages WHERE user_id = :u AND meta_token_enc IS NOT NULL AND meta_page_id IS NOT NULL ORDER BY name"
    ), {"u": user_id})).mappings().all()
    pages = [dict(r) for r in rows]
    from ...reviewer import demo_pages, is_reviewer

    if await is_reviewer(db, user_id):
        mine = {p["meta_page_id"] for p in pages}
        pages += [p for p in await demo_pages(db) if p["meta_page_id"] not in mine]
    return pages


@router.get("/page-analysis/pages")
async def analysis_pages(request: Request, db: AsyncSession = Depends(get_db)):
    """As páginas conectadas desta conta, para analisar com um clique (só os nomes)."""
    user_id = await _admin_id(request, db)
    return {"pages": [{"id": r["meta_page_id"], "name": r["name"]} for r in await _connected_pages(db, user_id)]}


@router.post("/page-analysis")
async def analyze_page(request: Request, db: AsyncSession = Depends(get_db)):
    """Analisar página: posts públicos de uma Página do Facebook com reações, comentários e compartilhamentos.

    Página conectada usa o token dela. Página de terceiros usa o acesso do servidor e depende de a Meta
    ter aprovado o Page Public Content Access; sem a aprovação a resposta vem com `blocked` explicando."""
    user_id = await _admin_id(request, db)
    import httpx

    from ...clipspy_pages import ORDERS, PageAccessError, find_pages, page_info, page_posts, parse_page_ref, rank, summary
    from ...facebook_meta import same_name
    from ...runtime_settings import decrypt_setting_value

    body = await request.json()
    try:
        ref = parse_page_ref(body.get("page") if isinstance(body, dict) else "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    order = body.get("order") if body.get("order") in ORDERS else "engajamento"
    connected = await _connected_pages(db, user_id)
    names = [r["name"] for r in connected]

    def own_page(page_id: str = "", name: str = "") -> dict[str, Any] | None:
        return next((r for r in connected if (page_id and r["meta_page_id"] == page_id) or (name and same_name(r["name"], name))), None)

    own = own_page(ref["value"], "") if ref["kind"] == "id" else own_page("", ref["value"]) if ref["kind"] == "name" else None
    server_token = adlib_token()
    used_server = False
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            if own:
                token, target = decrypt_setting_value(own["meta_token_enc"]), own["meta_page_id"]
            else:
                if not server_token:
                    return {"blocked": "O acesso ao Facebook ainda não foi configurado no servidor. Por enquanto a análise funciona com as páginas conectadas em Facebook.", "connected": names}
                used_server = True
                if ref["kind"] == "name":
                    return {"candidates": await find_pages(ref["value"], server_token, client), "query": ref["value"]}
                token, target = server_token, ref["value"]
            page = await page_info(target, token, client)
            mine = None if own else own_page(page["id"], "")
            if mine:  # o endereço era de uma página conectada: os posts vêm com o token dela
                token, used_server, own = decrypt_setting_value(mine["meta_token_enc"]), False, mine
            posts = rank(await page_posts(page["id"], token, client), order)
    except PageAccessError as exc:
        if exc.expired and used_server:
            from ...adlib_auth import mark_stale

            mark_stale()
        if exc.needs_feature:
            return {"blocked": str(exc), "connected": names}
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Não consegui falar com o Facebook agora. Tente de novo em instantes.") from exc
    return {"page": page, "posts": posts, "summary": summary(posts), "via": "conectada" if own else "publica"}


@router.get("/bank")
async def bank(request: Request, champion: int = 0, source: str = "", db: AsyncSession = Depends(get_db)):
    """Lista a biblioteca de criativos salva (opcionalmente só os campeões)."""
    user_id = await _admin_id(request, db)
    from ...reviewer import is_reviewer, seed_references

    if await is_reviewer(db, user_id):
        try:
            await seed_references(db, user_id)
        except Exception:  # a biblioteca abre mesmo que o exemplo não possa ser criado agora
            logger.warning("conta do revisor: falha ao criar as referências de exemplo", exc_info=True)
            await db.rollback()
    clauses = ["user_id = :u", "status <> 'arquivado'"]
    params: dict[str, Any] = {"u": user_id}
    if champion:
        clauses.append("is_champion = TRUE")
    if source:
        clauses.append("source = :src")
        params["src"] = source
    rows = (await db.execute(text(
        f"SELECT id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status "
        f"FROM creative_bank WHERE {' AND '.join(clauses)} ORDER BY is_champion DESC, score DESC, discovered_at DESC LIMIT 200"
    ), params)).all()
    return {"items": [_row(r) for r in rows]}


@router.post("/bank/{item_id}/recipe")
async def recipe(item_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Extrai a receita de beats do TEXTO de um criativo vencedor (modelagem).

    Usa o texto do anúncio (não o vídeo, que a Ad Library não entrega): devolve a
    sequência de beats e os pesos para modelar a copy do usuário no Gerador de Cenas.
    """
    user_id = await _admin_id(request, db)
    row = (await db.execute(text(
        "SELECT advertiser, title, metrics FROM creative_bank WHERE id = :id AND user_id = :u"
    ), {"id": item_id, "u": user_id})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Criativo não encontrado")
    from ...clipspy_references import modeling_text, reference_notes

    try:
        metrics = json.loads(row.metrics) if row.metrics else {}
    except (ValueError, TypeError):
        metrics = {}
    # Referência manual pode vir sem o texto inteiro: o hook e a CTA anotados já dão a estrutura.
    ad_text = modeling_text(row.title or "", metrics)
    if len(ad_text) < 10:
        raise HTTPException(status_code=400, detail="Esse anúncio não tem texto suficiente para modelar.")

    from ...ai import extract_recipe  # import tardio (dependências pesadas de IA)

    try:
        beat_recipe = await extract_recipe(ad_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Falha ao extrair a receita: {exc}") from exc

    # Guarda a estrutura na referência: é o que a biblioteca exporta (CSV e resumo) sem pedir a IA de novo.
    metrics["recipe"] = {"beats": beat_recipe.beats, "summary": beat_recipe.summary}
    await db.execute(text("UPDATE creative_bank SET metrics = :m WHERE id = :id AND user_id = :u"),
                     {"m": json.dumps(metrics), "id": item_id, "u": user_id})
    await db.commit()
    return {
        "advertiser": row.advertiser or "",
        # notes: o que a pessoa anotou do vencedor (hook, sentimento, CTA); o Gerador de Cenas usa como direção.
        "recipe": {"beats": beat_recipe.beats, "summary": beat_recipe.summary, "notes": reference_notes(metrics)},
    }


@router.post("/bank/{item_id}/status")
async def set_status(item_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Marca um criativo como salvo, usado ou arquivado."""
    user_id = await _admin_id(request, db)
    status = str((await request.json()).get("status") or "").strip()
    if status not in {"novo", "salvo", "usado", "arquivado"}:
        raise HTTPException(status_code=400, detail="Status inválido")
    result = await db.execute(text(
        "UPDATE creative_bank SET status = :s WHERE id = :id AND user_id = :u"
    ), {"s": status, "id": item_id, "u": user_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Criativo não encontrado")
    await db.commit()
    return {"ok": True, "status": status}
