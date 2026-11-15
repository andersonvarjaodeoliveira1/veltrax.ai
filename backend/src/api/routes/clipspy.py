"""ClipSpy — radar de criativos vencedores (Fase 1: Meta Ad Library).

Busca anúncios ativos por termo, persiste no banco de criativos (creative_bank)
e serve a biblioteca para a tela de criação modelar os vencedores.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...clipspy import adlib_token, search_ad_library
from ...database import get_db
from .multiplier import _user_id

router = APIRouter(prefix="/clipspy", tags=["clipspy"])


@router.get("/status")
async def status(request: Request, db: AsyncSession = Depends(get_db)):
    """Diz se a Ad Library está configurada no servidor, sem nunca expor o token.

    A interface usa isso para mostrar a tela de configuracao em vez de disparar
    uma busca que falharia.
    """
    user_id = await _user_id(request, db)  # exige sessão válida
    out: dict[str, Any] = {"configured": adlib_token() is not None}
    if await _is_admin(db, user_id):
        # Só o administrador vê a validade e a renovação (sem o valor do token).
        from ...adlib_auth import snapshot

        out["access"] = snapshot()
    return out


async def _is_admin(db: AsyncSession, user_id: str) -> bool:
    row = (await db.execute(text("SELECT is_admin FROM users WHERE id = :u"), {"u": user_id})).first()
    return bool(row and row[0])


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
    user_id = await _user_id(request, db)
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
    user_id = await _user_id(request, db)
    from ...clipspy_references import manual_reference

    try:
        ref = manual_reference(await request.json())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = (await db.execute(text(
        """
        INSERT INTO creative_bank
          (id, user_id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status)
        VALUES
          (:id, :u, :src, :ext, :adv, :title, :link, '', :metrics, :score, :champ, :term, 'salvo')
        ON CONFLICT (user_id, source, external_id) DO UPDATE SET
          advertiser = EXCLUDED.advertiser, title = EXCLUDED.title, permalink = EXCLUDED.permalink,
          metrics = EXCLUDED.metrics, score = EXCLUDED.score, is_champion = EXCLUDED.is_champion, status = 'salvo'
        RETURNING id, source, external_id, advertiser, title, permalink, thumbnail, metrics, score, is_champion, term, status
        """
    ), {
        "id": str(uuid.uuid4()), "u": user_id, "src": ref["source"], "ext": ref["external_id"], "adv": ref["advertiser"],
        "title": ref["title"], "link": ref["permalink"], "metrics": json.dumps(ref["metrics"]), "score": ref["score"],
        "champ": ref["is_champion"], "term": ref["term"],
    })).first()
    await db.commit()
    return _row(row)


@router.get("/bank")
async def bank(request: Request, champion: int = 0, source: str = "", db: AsyncSession = Depends(get_db)):
    """Lista a biblioteca de criativos salva (opcionalmente só os campeões)."""
    user_id = await _user_id(request, db)
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
    user_id = await _user_id(request, db)
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

    return {
        "advertiser": row.advertiser or "",
        # notes: o que a pessoa anotou do vencedor (hook, sentimento, CTA); o Gerador de Cenas usa como direção.
        "recipe": {"beats": beat_recipe.beats, "summary": beat_recipe.summary, "notes": reference_notes(metrics)},
    }


@router.post("/bank/{item_id}/status")
async def set_status(item_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Marca um criativo como salvo, usado ou arquivado."""
    user_id = await _user_id(request, db)
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
