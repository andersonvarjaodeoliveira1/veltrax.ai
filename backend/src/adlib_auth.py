"""Acesso à Ad Library que se mantém sozinho.

A Meta não tem "refresh token": o token de usuário de longa duração (cerca de 60 dias)
é ele mesmo a chave para pedir outro. Este módulo:

1. recebe o token colado pelo administrador (Admin, Configurações, ou META_ADLIB_TOKEN
   no ambiente), mesmo o curto de 1 a 2 horas do Explorador da Graph API; sem token
   colado que sirva, usa o acesso de "Entrar com o Facebook" de um administrador, que
   já nasce de longa duração e se refaz com um clique;
2. troca na hora por um de longa duração (grant fb_exchange_token, com o ID e a chave
   secreta do app da Meta já configurados no Admin);
3. renova antes de vencer, guarda criptografado em app_settings e nunca devolve o valor;
4. avisa por e-mail quando a Meta exigir um login novo (senha trocada, acesso revogado,
   ou renovação recusada), porque isso nenhum servidor resolve sozinho.

Roda dentro do processo da API (um só), no mesmo molde de sweep_forever/alert_forever.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from html import escape
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)

SEED_KEY = "META_ADLIB_TOKEN"  # o que o administrador cola (ambiente ou Admin)
STORE_KEY = "META_ADLIB_TOKEN_AUTO"  # o token vivo, já trocado/renovado (app_settings, criptografado)
DAY = 86400
TICK_SECONDS = 60  # o laço acorda a cada minuto, mas só fala com a Meta quando precisa
CHECK_EVERY = 6 * 3600  # conferência de rotina quando está tudo certo
RETRY_EVERY = 15 * 60  # nova tentativa quando algo falhou
SHORT_BELOW = 2 * DAY  # token do Explorador (1 a 2 h): troca imediata
RENEW_BELOW = 53 * DAY  # token longo: renova quando já gastou uma semana
MIN_AGE_TO_RENEW = 25 * 3600  # a Meta só dá validade nova para token com mais de 24 h
WARN_BELOW = 7 * DAY
ALERT_EVERY = DAY

GraphCall = Callable[[str, dict[str, str]], Awaitable[dict[str, Any]]]

_state: dict[str, Any] = {}
_loaded = False


class GraphError(Exception):
    def __init__(self, message: str, code: int = 0) -> None:
        super().__init__(message)
        self.code = code

    @property
    def auth(self) -> bool:
        """Erro de token (vencido, revogado, inválido), e não de rede."""
        return self.code in (102, 190, 463, 467)


def _fp(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]


def _seeds() -> list[tuple[str, str]]:
    """Tokens colados pelo administrador: o do Admin primeiro, depois o do ambiente."""
    from .runtime_settings import get_cached_setting

    out: list[tuple[str, str]] = []
    for source, value in (("admin", get_cached_setting(SEED_KEY)), ("ambiente", os.getenv(SEED_KEY))):
        token = (value or "").strip()
        if token and token not in [t for _, t in out]:
            out.append((source, token))
    return out


def _new_seed() -> tuple[str, str] | None:
    """Um token colado que ainda não foi adotado (o mais recente sempre vence o guardado)."""
    seen = set(_state.get("seen") or [])
    for source, token in _seeds():
        if _fp(token) not in seen:
            return source, token
    return None


def current_token() -> str | None:
    """O token em uso agora. Nunca sai do servidor."""
    fresh = _new_seed()
    if fresh:
        return fresh[1]
    stored = str(_state.get("token") or "").strip()
    if stored:
        return stored
    seeds = _seeds()
    return seeds[0][1] if seeds else None


def app_credentials() -> tuple[str, str] | None:
    """App da Meta que emitiu o token. Por padrão é o mesmo do Entrar com o Facebook."""
    from .config import Config

    app_id = (os.getenv("META_ADLIB_APP_ID") or Config._get_runtime_setting("META_APP_ID") or "").strip()
    secret = (os.getenv("META_ADLIB_APP_SECRET") or Config._get_runtime_setting("META_APP_SECRET") or "").strip()
    return (app_id, secret) if app_id and secret else None


async def _login_candidates(session_factory) -> list[tuple[str, str]]:
    """Acessos de "Entrar com o Facebook" dos administradores, do mais recente para o mais antigo."""
    from sqlalchemy import text

    from .runtime_settings import decrypt_setting_value

    async with session_factory() as db:
        rows = (await db.execute(text(
            """
            SELECT m.token_enc, m.fb_user_name FROM fb_meta_auth m
            JOIN users u ON u.id = m.user_id
            WHERE u.is_admin = TRUE ORDER BY m.connected_at DESC LIMIT 8
            """
        ))).all()
    out: list[tuple[str, str]] = []
    for token_enc, name in rows:
        try:
            token = decrypt_setting_value(token_enc).strip()
        except Exception:  # noqa: BLE001 - acesso guardado com outra chave; ignora
            continue
        if token:
            out.append((f"facebook: {name or 'perfil conectado'}", token))
    return out


async def _can_search(token: str, graph: GraphCall) -> bool:
    """O perfil tem acesso à Ad Library? (exige identidade confirmada na Meta)"""
    try:
        await graph("ads_archive", {"access_token": token, "search_terms": "a", "ad_type": "ALL", "ad_active_status": "ACTIVE",
                                    "ad_reached_countries": '["DE"]', "fields": "id", "limit": "1"})
        return True
    except GraphError:
        return False


async def _try_logins(session_factory, graph: GraphCall) -> bool:
    """Sem token colado que sirva: adota o primeiro acesso de login que consegue pesquisar."""
    tried = list(_state.get("login_seen") or [])
    try:
        candidates = await _login_candidates(session_factory)
    except Exception:  # noqa: BLE001 - tabela ausente ou banco fora; tenta no próximo ciclo
        logger.warning("não foi possível ler os acessos de Entrar com o Facebook", exc_info=True)
        return False
    for source, token in candidates:
        if _fp(token) in tried:
            continue
        try:
            await _expiry_of(token, app_credentials(), graph)
            works = await _can_search(token, graph)
        except GraphError:
            works = False  # vencido ou revogado: não tenta de novo
        except Exception:  # noqa: BLE001 - rede; tenta este mesmo acesso no próximo ciclo
            return False
        tried.append(_fp(token))
        _state["login_seen"] = tried[-20:]
        if works:
            _adopt(source, token)
            return True
        _state["login_note"] = f"O perfil de {source.removeprefix('facebook: ')} está conectado, mas a Meta não liberou a Ad Library para ele."
    return False


def mark_stale() -> None:
    """Uma busca recebeu erro de token: confere de novo no próximo minuto."""
    _state["checked_at"] = 0


def snapshot(now: float | None = None) -> dict[str, Any]:
    """Situação para a tela do administrador. Sem o token, sem a chave do app."""
    now = time.time() if now is None else now
    expires_at = int(_state.get("expires_at") or 0)
    status = str(_state.get("status") or ("novo" if current_token() else "ausente"))
    never = status == "ok" and expires_at == 0 and bool(_state.get("token"))
    detail = str(_state.get("detail") or "")
    if status in ("expirado", "ausente", "vencendo") and _state.get("login_note"):
        detail = f"{detail} {_state['login_note']}".strip()
    return {
        "status": status,
        "days_left": None if never or not expires_at else max(0, int((expires_at - now) // DAY)),
        "never_expires": never,
        "auto": bool(_state.get("auto")),
        "detail": detail,
        "source": str(_state.get("source") or ""),
        "checked_at": int(_state.get("checked_at") or 0),
        "renewed_at": int(_state.get("renewed_at") or 0),
    }


async def _graph_get(path: str, params: dict[str, str]) -> dict[str, Any]:
    import httpx

    from .clipspy import GRAPH, GRAPH_VERSION

    async with httpx.AsyncClient(timeout=httpx.Timeout(25, connect=15)) as client:
        r = await client.get(f"{GRAPH}/{GRAPH_VERSION}/{path}", params=params)
    body = r.json() if r.content else {}
    if r.status_code >= 400 or (isinstance(body, dict) and "error" in body):
        err = (body or {}).get("error") or {}
        raise GraphError(str(err.get("message") or f"Erro {r.status_code} na Meta"), int(err.get("code") or 0))
    return body if isinstance(body, dict) else {}


async def _load(session_factory) -> None:
    global _loaded
    from sqlalchemy import text

    from .runtime_settings import decrypt_setting_value

    try:
        async with session_factory() as db:
            row = (await db.execute(text("SELECT encrypted_value FROM app_settings WHERE setting_key = :k"), {"k": STORE_KEY})).first()
        if row and row[0]:
            data = json.loads(decrypt_setting_value(row[0]))
            if isinstance(data, dict):
                _state.clear()
                _state.update(data)
    except Exception:  # noqa: BLE001 - sem o guardado, segue com o token colado
        logger.warning("não foi possível ler o acesso guardado da Ad Library", exc_info=True)
    _loaded = True


async def _save(session_factory) -> None:
    from sqlalchemy import text

    from .runtime_settings import encrypt_setting_value

    try:
        payload = encrypt_setting_value(json.dumps(_state))
        async with session_factory() as db:
            await db.execute(
                text(
                    """
                    INSERT INTO app_settings (setting_key, encrypted_value)
                    VALUES (:k, :v)
                    ON CONFLICT (setting_key) DO UPDATE
                    SET encrypted_value = EXCLUDED.encrypted_value, updated_at = CURRENT_TIMESTAMP
                    """
                ),
                {"k": STORE_KEY, "v": payload},
            )
            await db.commit()
    except Exception:  # noqa: BLE001 - continua valendo em memória até o próximo ciclo
        logger.warning("não foi possível guardar o acesso da Ad Library", exc_info=True)


def _adopt(source: str, token: str) -> None:
    seen = list(_state.get("seen") or [])
    for _, seed in _seeds():  # marca todos os colados como vistos, para não alternar entre Admin e ambiente
        if _fp(seed) not in seen:
            seen.append(_fp(seed))
    _state.update(token=token, source=source, expires_at=0, renewed_at=0, checked_at=0,
                  status="novo", detail="", auto=False, alerted_at=0, seen=seen[-12:], login_note="")


async def _expiry_of(token: str, app: tuple[str, str] | None, graph: GraphCall) -> tuple[int, str]:
    """Validade (epoch, 0 = não vence) e o app que emitiu. Levanta GraphError se o token não vale mais."""
    access = f"{app[0]}|{app[1]}" if app else token
    data = (await graph("debug_token", {"input_token": token, "access_token": access})).get("data") or {}
    if not data.get("is_valid"):
        raise GraphError(str((data.get("error") or {}).get("message") or "O token não é mais válido"), 190)
    return int(data.get("expires_at") or 0), str(data.get("app_id") or "")


async def _check_and_renew(now: float, graph: GraphCall) -> None:
    token = str(_state.get("token") or "")
    app = app_credentials()
    _state["checked_at"] = int(now)
    _state["auto"] = False
    try:
        expires_at, issued_by = await _expiry_of(token, app, graph)
    except GraphError as exc:
        if exc.auth:
            _state.update(status="expirado", detail="O acesso venceu ou foi revogado. Cole um token novo.", expires_at=int(now))
        else:
            _state.update(status="erro", detail=f"A Meta não respondeu à conferência: {exc}")
        return
    except Exception as exc:  # noqa: BLE001 - rede; tenta de novo em 15 minutos
        _state.update(status="erro", detail=f"Falha de rede ao conferir o acesso: {type(exc).__name__}")
        return

    _state["expires_at"] = expires_at
    if expires_at == 0:
        _state.update(status="ok", detail="Esse acesso não tem data de validade.", auto=True)
        return
    left = expires_at - now
    low = left < WARN_BELOW
    if not app:
        _state.update(status="vencendo" if low else "sem_app",
                      detail="Falta o ID e a chave secreta do app da Meta no Admin para renovar sozinho.")
        return
    if issued_by and issued_by != app[0]:
        _state.update(status="vencendo" if low else "outro_app",
                      detail="O token foi gerado em outro app da Meta, diferente do configurado no Admin. Gere o token no mesmo app.")
        return

    is_short = left < SHORT_BELOW
    old_enough = now - float(_state.get("renewed_at") or 0) >= MIN_AGE_TO_RENEW
    if not (is_short or (left < RENEW_BELOW and old_enough)):
        _state.update(status="ok", detail="", auto=True)
        return

    try:
        res = await graph("oauth/access_token", {"grant_type": "fb_exchange_token", "client_id": app[0],
                                                 "client_secret": app[1], "fb_exchange_token": token})
        new_token = str(res.get("access_token") or "")
        if not new_token:
            raise GraphError("A Meta não devolveu um acesso novo")
        expires_in = int(res.get("expires_in") or 0)
        new_expires = int(now + expires_in) if expires_in else (await _expiry_of(new_token, app, graph))[0]
    except GraphError as exc:
        _state.update(status="vencendo" if low else "falha_renovacao", detail=f"A Meta recusou a renovação: {exc}")
        _state["renewed_at"] = int(now)  # nova tentativa só amanhã, para não insistir
        return
    except Exception as exc:  # noqa: BLE001
        _state.update(status="erro", detail=f"Falha de rede ao renovar: {type(exc).__name__}")
        return

    _state["renewed_at"] = int(now)
    gained = new_expires == 0 or new_expires > expires_at + DAY
    if gained or new_expires >= expires_at:
        _state.update(token=new_token, expires_at=new_expires)
    if gained:
        _state.update(status="ok", detail="", auto=True)
        logger.info("acesso da Ad Library renovado; vale por %s dias", "sempre" if not new_expires else int((new_expires - now) // DAY))
    else:
        # A Meta devolveu a mesma validade. Tenta de novo a cada dia; se chegar perto do fim, avisa.
        _state.update(status="vencendo" if low else "ok", auto=not low,
                      detail="A Meta ainda não deu validade nova; nova tentativa amanhã." if not low
                      else "A Meta não está renovando esse acesso. Cole um token novo.")


def _alert_content(snap: dict[str, Any]):
    from .services.email_service import EmailContent

    left = snap["days_left"]
    when = "já venceu" if snap["status"] == "expirado" else (f"vence em {left} {'dia' if left == 1 else 'dias'}" if left is not None else "precisa de atenção")
    steps = ("Abra developers.facebook.com/tools/explorer, clique em Generate Access Token e copie o token. "
             "Depois cole em Admin, Configurações, no campo Token da Ad Library, e salve. "
             "O servidor troca por um de 60 dias e volta a renovar sozinho.")
    detail = snap["detail"] or ""
    return EmailContent(
        subject=f"ClipSpy: o acesso à Ad Library {when}",
        html=f"<p>O acesso do ClipSpy à Ad Library da Meta {escape(when)}.</p>"
             + (f"<p>{escape(detail)}</p>" if detail else "")
             + f"<p>{escape(steps)}</p><p>Equipe ClipGringa</p>",
        text=f"O acesso do ClipSpy à Ad Library da Meta {when}.\n\n{detail}\n\n{steps}\n\nEquipe ClipGringa",
    )


async def _maybe_alert(now: float) -> bool:
    snap = snapshot(now)
    needs = snap["status"] in ("expirado", "vencendo")
    if not needs or now - float(_state.get("alerted_at") or 0) < ALERT_EVERY:
        return False
    from .config import get_config
    from .security_alerts import recipients
    from .services.email_service import SesEmailService

    service = SesEmailService(get_config())
    _state["alerted_at"] = int(now)
    if not service.is_configured:
        logger.warning("acesso da Ad Library %s e o e-mail de aviso não está configurado", snap["status"])
        return False
    content = _alert_content(snap)
    for address in recipients():
        try:
            await service.send_email(address, content)
        except Exception:  # noqa: BLE001
            logger.warning("falha ao avisar sobre o acesso da Ad Library", exc_info=True)
    return True


async def tick(session_factory, *, now: float | None = None, graph: GraphCall | None = None, force: bool = False) -> dict[str, Any]:
    """Um ciclo: adota token colado, confere a validade, renova se for hora e guarda."""
    now = time.time() if now is None else now
    graph = graph or _graph_get
    if not _loaded:
        await _load(session_factory)
    fresh = _new_seed()
    if fresh:
        _adopt(*fresh)
    elif not _state.get("token") or _state.get("status") in ("expirado", "vencendo"):
        # Nada colado que sirva: vale o acesso de "Entrar com o Facebook" de um administrador.
        tried_before = list(_state.get("login_seen") or [])
        if await _try_logins(session_factory, graph):
            fresh = (str(_state.get("source")), str(_state.get("token")))
        elif tried_before != list(_state.get("login_seen") or []):
            await _save(session_factory)  # lembra os acessos que não serviram, para não testar de novo
    if not _state.get("token"):
        return snapshot(now)
    wait = RETRY_EVERY if _state.get("status") in ("novo", "erro") else CHECK_EVERY
    if not (force or fresh or now - float(_state.get("checked_at") or 0) >= wait):
        return snapshot(now)
    await _check_and_renew(now, graph)
    try:
        await _maybe_alert(now)
    except Exception:  # noqa: BLE001 - o aviso é um extra
        logger.warning("falha ao preparar o aviso do acesso da Ad Library", exc_info=True)
    await _save(session_factory)
    return snapshot(now)


async def renew_forever(session_factory) -> None:
    while True:
        try:
            await tick(session_factory)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.warning("falha no ciclo de renovação do acesso da Ad Library", exc_info=True)
        await asyncio.sleep(TICK_SECONDS)
