"""Acesso do assinante da Gringatools ao ClipGringa (ferramenta bônus).

Quem tem assinatura ativa entra só com o e-mail (link enviado para a caixa dela). Quem cancela, pede
reembolso ou deixa vencer perde o acesso: a conferência roda em cada pedido de link e de tempos em tempos.

Como o servidor fala com a base da Gringatools sem ninguém manusear segredo:
1. este servidor gera um par de chaves Ed25519, guarda a chave privada criptografada em app_settings
   e publica só a chave pública em GET /access/public-key;
2. cada consulta vai assinada; a função `clipgringa-acesso` da base confere a assinatura com a chave
   pública e responde só "ativo ou não" (e o motivo) para os e-mails pedidos.

Contas convidadas pelo administrador, liberadas pela captura do cadastro e administradores não passam
por esta regra: continuam entrando como sempre.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Awaitable, Callable, Iterable

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DEFAULT_CHECK_URL = "https://uoqpmtvmcwbbogbzrkzq.supabase.co/functions/v1/clipgringa-acesso"
STORE_KEY = "GT_MEMBER_SIGNING_KEY"  # chave privada (app_settings, criptografada); nunca sai do servidor
SIGNATURE_HEADER = "x-cg-signature"
SWEEP_SECONDS = 30 * 60
BATCH = 100
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

Checker = Callable[[list[str]], Awaitable[dict[str, dict[str, Any]]]]


class MemberCheckError(RuntimeError):
    """A base da Gringatools não respondeu ou recusou a consulta. Ninguém perde nem ganha acesso por isso."""


def check_url() -> str | None:
    """Endereço da conferência. MEMBER_CHECK_URL=off desliga a entrada por assinatura (instalação própria)."""
    value = (os.getenv("MEMBER_CHECK_URL") or DEFAULT_CHECK_URL).strip()
    return None if value.lower() in ("off", "0", "false", "none") else value


def enabled() -> bool:
    return check_url() is not None


def normalize_email(value: str | None) -> str | None:
    email = (value or "").strip().lower()
    return email if len(email) <= 254 and EMAIL_RE.match(email) else None


# ---------------------------------------------------------------------------------------------------------------------
# Chave de assinatura
# ---------------------------------------------------------------------------------------------------------------------
_key: Ed25519PrivateKey | None = None
_key_lock = asyncio.Lock()


async def signing_key(db: AsyncSession) -> Ed25519PrivateKey:
    """Carrega a chave privada; na primeira vez, gera e guarda criptografada."""
    global _key
    if _key is not None:
        return _key
    from .runtime_settings import decrypt_setting_value, encrypt_setting_value

    async with _key_lock:
        if _key is not None:
            return _key
        def read(value: str) -> Ed25519PrivateKey:
            return Ed25519PrivateKey.from_private_bytes(base64.b64decode(decrypt_setting_value(value)))

        select = text("SELECT encrypted_value FROM app_settings WHERE setting_key = :k")
        row = (await db.execute(select, {"k": STORE_KEY})).first()
        unreadable = False
        if row and row[0]:
            try:
                _key = read(row[0])
                return _key
            except Exception:
                # A chave de criptografia do servidor mudou: a chave guardada não abre mais. Gera outra;
                # a base busca a chave pública nova sozinha quando a assinatura deixa de conferir.
                logger.warning("chave de assinatura ilegível; gerando uma nova")
                unreadable = True
        fresh = Ed25519PrivateKey.generate()
        raw = fresh.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
        conflict = "DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, updated_at = CURRENT_TIMESTAMP" if unreadable else "DO NOTHING"
        await db.execute(
            text(f"INSERT INTO app_settings (setting_key, encrypted_value) VALUES (:k, :v) ON CONFLICT (setting_key) {conflict}"),
            {"k": STORE_KEY, "v": encrypt_setting_value(base64.b64encode(raw).decode())},
        )
        await db.commit()
        # Outro processo pode ter gravado primeiro: vale a que ficou no banco.
        row = (await db.execute(select, {"k": STORE_KEY})).first()
        _key = read(row[0])
        return _key


async def public_key_b64(db: AsyncSession) -> str:
    key = await signing_key(db)
    raw = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(raw).decode()


def reset_key_cache() -> None:
    global _key
    _key = None


# ---------------------------------------------------------------------------------------------------------------------
# Consulta à base da Gringatools
# ---------------------------------------------------------------------------------------------------------------------
async def check_remote(db: AsyncSession, emails: Iterable[str], *, transport: httpx.AsyncBaseTransport | None = None) -> dict[str, dict[str, Any]]:
    """Pergunta à base se cada e-mail é de assinante ativo. Devolve {email: {ativo, motivo, nome, expira_em}}."""
    wanted = sorted({e for e in (normalize_email(x) for x in emails) if e})
    if not wanted:
        return {}
    url = check_url()
    if not url:
        raise MemberCheckError("conferência de assinatura desligada")
    key = await signing_key(db)
    found: dict[str, dict[str, Any]] = {}
    async with httpx.AsyncClient(timeout=20, transport=transport) as client:
        for start in range(0, len(wanted), BATCH):
            body = json.dumps({"emails": wanted[start:start + BATCH], "ts": int(time.time())}, separators=(",", ":")).encode()
            signature = base64.b64encode(key.sign(body)).decode()
            try:
                response = await client.post(url, content=body, headers={"Content-Type": "application/json", SIGNATURE_HEADER: signature})
            except httpx.HTTPError as exc:
                raise MemberCheckError(f"base da Gringatools fora do ar: {type(exc).__name__}") from exc
            if response.status_code != 200:
                raise MemberCheckError(f"base da Gringatools respondeu {response.status_code}")
            try:
                data = response.json()
            except ValueError as exc:
                raise MemberCheckError("resposta ilegível da base da Gringatools") from exc
            results = data.get("resultados") if isinstance(data, dict) and data.get("ok") else None
            if not isinstance(results, dict):
                raise MemberCheckError("resposta inesperada da base da Gringatools")
            for email in wanted[start:start + BATCH]:
                item = results.get(email)
                # E-mail que a base não devolveu conta como "não é assinante": nunca libera por omissão.
                found[email] = item if isinstance(item, dict) else {"ativo": False, "motivo": "nao_e_membro"}
    return found


def _as_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


async def _store(db: AsyncSession, email: str, result: dict[str, Any], *, create: bool) -> None:
    params = {
        "email": email,
        "active": bool(result.get("ativo")),
        "reason": (str(result.get("motivo"))[:40] if result.get("motivo") else None),
        "name": (str(result.get("nome"))[:120] if result.get("nome") else None),
        "expires": _as_date(result.get("expira_em")),
    }
    update = """
        UPDATE member_access SET
            lost_at = CASE WHEN :active THEN NULL WHEN active THEN NOW() ELSE lost_at END,
            active = :active, reason = :reason, member_name = COALESCE(:name, member_name),
            expires_on = :expires, checked_at = NOW()
        WHERE email = :email"""
    if create:
        await db.execute(text("""
            INSERT INTO member_access (email, active, reason, member_name, expires_on)
            VALUES (:email, :active, :reason, :name, :expires)
            ON CONFLICT (email) DO NOTHING"""), params)
    await db.execute(text(update), params)


# ---------------------------------------------------------------------------------------------------------------------
# Pedido de link: quem recebe o e-mail
# ---------------------------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Decision:
    """send: manda o link | inactive: conta de assinante sem assinatura ativa (avisa por e-mail) | skip: não manda nada."""
    action: str
    name: str | None = None
    why: str = ""


async def login_decision(db: AsyncSession, raw_email: str, *, checker: Checker | None = None) -> Decision:
    email = normalize_email(raw_email)
    if not email:
        return Decision("skip", why="email_invalido")

    asked: list[dict[str, Any]] = []

    async def ask() -> dict[str, Any]:
        # Uma consulta por pedido de link, mesmo quando duas regras precisam da resposta.
        if not asked:
            result = (await (checker([email]) if checker else check_remote(db, [email]))).get(email)
            asked.append(result if isinstance(result, dict) else {"ativo": False, "motivo": "nao_e_membro"})
        return asked[0]

    user = (await db.execute(text(
        "SELECT id, name, is_admin, test_expires_at IS NOT NULL FROM users WHERE lower(email) = :e LIMIT 1"), {"e": email})).first()
    row = (await db.execute(text("SELECT active, exempt, member_name FROM member_access WHERE email = :e"), {"e": email})).first()

    if user is None:
        # Sem conta: só nasce uma se o e-mail for de assinante ativo agora.
        if not enabled():
            return Decision("skip", why="sem_conta")
        try:
            result = await ask()
        except MemberCheckError as exc:
            logger.warning("conferência de assinatura falhou para e-mail sem conta: %s", exc)
            return Decision("skip", why="base_fora")
        if not result.get("ativo"):
            return Decision("skip", why=str(result.get("motivo") or "nao_e_membro"))
        await _store(db, email, result, create=True)
        await db.commit()
        return Decision("send", name=result.get("nome"), why="assinante_novo")

    user_id, user_name, is_admin, on_test = user[0], user[1], bool(user[2]), bool(user[3])
    if is_admin:
        return Decision("send", name=user_name, why="admin")
    signup = (await db.execute(text("SELECT status FROM signup_requests WHERE user_id = :u"), {"u": user_id})).first()
    if signup is not None and signup[0] != "approved":
        # Cadastro da captura: aguardando ou recusado não recebe link (o link apagaria a senha escolhida no cadastro).
        return Decision("skip", why=f"cadastro_{signup[0]}")
    if on_test and enabled():
        # Conta de teste (convite com prazo) de quem é assinante ativo: o prazo do teste deixa de valer e a conta passa a
        # seguir a assinatura. Sem isso, o link chegava e a entrada era recusada com "o seu acesso de teste terminou".
        try:
            result = await ask()
        except MemberCheckError as exc:
            logger.warning("conferência de assinatura falhou para conta de teste: %s", exc)
            result = {}
        if result.get("ativo"):
            await db.execute(text("UPDATE users SET test_expires_at = NULL WHERE id = :u"), {"u": user_id})
            await _store(db, email, result, create=True)
            await db.commit()
            return Decision("send", name=user_name or result.get("nome"), why="teste_virou_assinante")
    if signup is not None:
        return Decision("send", name=user_name, why="liberado")
    if row is None:
        return Decision("send", name=user_name, why="convidado")
    if bool(row[1]):
        return Decision("send", name=user_name or row[2], why="mantido")

    # Conta que entrou como assinante: confere de novo na hora.
    try:
        result = await ask()
    except MemberCheckError as exc:
        logger.warning("conferência de assinatura falhou; vale a última situação conhecida: %s", exc)
        return Decision("send" if bool(row[0]) else "inactive", name=user_name or row[2], why="base_fora")
    await _store(db, email, result, create=False)
    if not result.get("ativo"):
        closed = await _close_access(db, [email])
        await db.commit()
        if closed:
            logger.info("assinatura inativa no pedido de link: %d sessões/chaves encerradas", closed)
        return Decision("inactive", name=user_name or row[2], why=str(result.get("motivo") or "inativo"))
    await db.commit()
    return Decision("send", name=user_name or row[2] or result.get("nome"), why="assinante")


# ---------------------------------------------------------------------------------------------------------------------
# Perda de acesso
# ---------------------------------------------------------------------------------------------------------------------
# Só perde o acesso quem entrou como assinante: nunca administrador, nunca cadastro liberado pelo administrador.
_GATED_USERS = """
    SELECT u.id FROM users u
    JOIN member_access m ON m.email = lower(u.email)
    WHERE m.email = ANY(:emails) AND m.active = FALSE AND m.exempt = FALSE AND u.is_admin = FALSE
      AND NOT EXISTS (SELECT 1 FROM signup_requests r WHERE r.user_id = u.id AND r.status = 'approved')"""


async def _close_access(db: AsyncSession, emails: list[str]) -> int:
    """Encerra as sessões e revoga as chaves de acesso de quem ficou sem assinatura ativa."""
    if not emails:
        return 0
    sessions = await db.execute(text(f'DELETE FROM session WHERE "userId" IN ({_GATED_USERS})'), {"emails": emails})
    keys = await db.execute(text(f"UPDATE api_keys SET revoked_at = NOW() WHERE revoked_at IS NULL AND user_id IN ({_GATED_USERS})"), {"emails": emails})
    return int((sessions.rowcount or 0) + (keys.rowcount or 0))


async def sweep(db: AsyncSession, *, checker: Checker | None = None) -> dict[str, int]:
    """Confere de novo todas as contas que entraram como assinante e tira o acesso de quem deixou de ser."""
    rows = (await db.execute(text("""
        SELECT m.email, m.active FROM member_access m
        WHERE EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = m.email)
        ORDER BY m.email"""))).all()
    emails = [r[0] for r in rows]
    was_active = {r[0] for r in rows if r[1]}
    if not emails:
        return {"checked": 0, "lost": 0, "back": 0, "closed": 0}
    results = await (checker(emails) if checker else check_remote(db, emails))
    lost = [e for e in emails if e in was_active and not (results.get(e) or {}).get("ativo")]
    back = [e for e in emails if e not in was_active and (results.get(e) or {}).get("ativo")]
    # Trava de segurança: se metade ou mais das contas ativas "caiu" de uma vez, o mais provável é um problema
    # na base, não uma onda de cancelamentos. Não mexe em nada e avisa no registro.
    if len(lost) >= 10 and len(lost) * 2 >= len(was_active):
        logger.error("conferência de assinatura: %d de %d contas ativas apareceram como inativas de uma vez; nada foi alterado", len(lost), len(was_active))
        return {"checked": len(emails), "lost": 0, "back": 0, "closed": 0, "held": len(lost)}
    for email in emails:
        result = results.get(email)
        if isinstance(result, dict):
            await _store(db, email, result, create=False)
    # Fecha também as sessões de quem já estava inativo (por exemplo, sessão aberta antes da regra existir).
    closed = await _close_access(db, emails)
    await db.commit()
    return {"checked": len(emails), "lost": len(lost), "back": len(back), "closed": closed}


async def sweep_forever(session_factory) -> None:
    await asyncio.sleep(60)
    while True:
        try:
            if enabled():
                async with session_factory() as db:
                    done = await sweep(db)
                if done.get("lost") or done.get("back") or done.get("closed"):
                    logger.info("conferência de assinatura: %s", done)
        except asyncio.CancelledError:
            raise
        except MemberCheckError as exc:
            logger.warning("conferência de assinatura adiada: %s", exc)
        except Exception:
            logger.warning("falha na conferência de assinatura", exc_info=True)
        await asyncio.sleep(SWEEP_SECONDS)
