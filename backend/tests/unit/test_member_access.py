"""Acesso do assinante: quem recebe o link de entrada e quem perde o acesso."""
import base64
import json
import time
import uuid

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from src import member_access
from src.database import get_db
from src.api.routes import access as access_routes
from src.services.login_link_email_service import LoginLinkEmailService

def _email(tag: str) -> str:
    return f"ma-{tag}-{uuid.uuid4().hex[:10]}@clipgringa.test"


def checker(result_by_email=None, default=None, calls=None, fail=False):
    async def run(emails):
        if calls is not None:
            calls.append(list(emails))
        if fail:
            raise member_access.MemberCheckError("fora do ar")
        return {e: (result_by_email or {}).get(e, default or {"ativo": False, "motivo": "nao_e_membro"}) for e in emails}
    return run


ACTIVE = {"ativo": True, "motivo": None, "nome": "Marina", "expira_em": "2027-01-10"}
CANCELLED = {"ativo": False, "motivo": "cancelou", "nome": "Marina", "expira_em": "2027-01-10"}


@pytest.fixture()
async def db(db_session):
    created: list[str] = []

    async def add_user(email, *, admin=False, signup=None, session=True, api_key=True):
        user_id = str(uuid.uuid4())
        await db_session.execute(text('INSERT INTO users (id, name, email, is_admin, "emailVerified") VALUES (:i, :n, :e, :a, TRUE)'), {"i": user_id, "n": "Pessoa Teste", "e": email, "a": admin})
        if signup:
            await db_session.execute(text("INSERT INTO signup_requests (user_id, name, email, cpf, phone, status) VALUES (:i, 'Pessoa Teste', :e, :c, '11999990000', :s)"),
                                     {"i": user_id, "e": email, "c": f"{uuid.uuid4().int % 10**11:011d}", "s": signup})
        if session:
            await db_session.execute(text('INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES (:i, NOW() + interval \'7 days\', :t, NOW(), NOW(), :u)'),
                                     {"i": str(uuid.uuid4()), "t": uuid.uuid4().hex, "u": user_id})
        if api_key:
            await db_session.execute(text("INSERT INTO api_keys (user_id, key_hash, key_prefix) VALUES (:u, :h, 'sk_test')"), {"u": user_id, "h": uuid.uuid4().hex + uuid.uuid4().hex})
        await db_session.commit()
        created.append(email)
        return user_id

    async def add_row(email, *, active=True, exempt=False):
        await db_session.execute(text("INSERT INTO member_access (email, active, exempt) VALUES (:e, :a, :x)"), {"e": email, "a": active, "x": exempt})
        await db_session.commit()
        created.append(email)

    async def open_sessions(user_id):
        return (await db_session.execute(text('SELECT COUNT(*) FROM session WHERE "userId" = :u'), {"u": user_id})).scalar()

    async def live_keys(user_id):
        return (await db_session.execute(text("SELECT COUNT(*) FROM api_keys WHERE user_id = :u AND revoked_at IS NULL"), {"u": user_id})).scalar()

    async def row(email):
        return (await db_session.execute(text("SELECT active, reason, member_name, exempt, lost_at FROM member_access WHERE email = :e"), {"e": email})).first()

    member_access.reset_key_cache()
    db_session.add_user, db_session.add_row, db_session.open_sessions = add_user, add_row, open_sessions
    db_session.live_keys, db_session.row, db_session.track = live_keys, row, created.append
    # A tabela de sessões é criada pelo site (Better Auth); no banco de teste do servidor ela pode não existir.
    await db_session.execute(text('''
        CREATE TABLE IF NOT EXISTS session (
            id VARCHAR(36) PRIMARY KEY, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, token VARCHAR(255) UNIQUE NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "ipAddress" VARCHAR(255), "userAgent" TEXT, "userId" VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE)'''))
    # Os testes de varredura olham a tabela inteira: começam com ela vazia.
    await db_session.execute(text("DELETE FROM member_access"))
    await db_session.commit()
    try:
        yield db_session
    finally:
        await db_session.rollback()
        await db_session.execute(text("DELETE FROM member_access"))
        await db_session.execute(text("DELETE FROM users WHERE email LIKE 'ma-%@clipgringa.test'"))
        await db_session.commit()


# --- Consulta assinada -------------------------------------------------------------------------------------------------

async def test_consulta_vai_assinada_e_a_base_confere_com_a_chave_publica(db, monkeypatch):
    monkeypatch.setenv("MEMBER_CHECK_URL", "https://base.test/clipgringa-acesso")
    public = Ed25519PublicKey.from_public_bytes(base64.b64decode(await member_access.public_key_b64(db)))
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        public.verify(base64.b64decode(request.headers[member_access.SIGNATURE_HEADER]), request.content)  # levanta se a assinatura não bater
        body = json.loads(request.content)
        seen.update(body)
        return httpx.Response(200, json={"ok": True, "resultados": {"a@x.com": ACTIVE}})

    found = await member_access.check_remote(db, ["A@x.com ", "b@x.com", "nao é e-mail"], transport=httpx.MockTransport(handler))

    assert seen["emails"] == ["a@x.com", "b@x.com"] and abs(seen["ts"] - time.time()) < 30
    assert found["a@x.com"]["ativo"] is True
    # O que a base não devolveu nunca libera por omissão.
    assert found["b@x.com"] == {"ativo": False, "motivo": "nao_e_membro"}


async def test_a_chave_e_a_mesma_depois_de_reiniciar(db):
    first = await member_access.public_key_b64(db)
    member_access.reset_key_cache()
    assert await member_access.public_key_b64(db) == first


async def test_chave_ilegivel_e_trocada_em_vez_de_travar_a_entrada(db, monkeypatch):
    first = await member_access.public_key_b64(db)
    # A chave de criptografia do servidor mudou: o que estava guardado não abre mais.
    monkeypatch.setenv("APP_SETTINGS_ENCRYPTION_KEY", "outra-chave-de-teste-0123456789abcdef0123456789")
    member_access.reset_key_cache()
    second = await member_access.public_key_b64(db)
    assert second != first and len(base64.b64decode(second)) == 32
    member_access.reset_key_cache()
    assert await member_access.public_key_b64(db) == second


@pytest.mark.parametrize("response", [httpx.Response(500), httpx.Response(200, json={"ok": False}), httpx.Response(200, text="<html>")])
async def test_base_com_problema_vira_erro_e_nao_resposta(db, monkeypatch, response):
    monkeypatch.setenv("MEMBER_CHECK_URL", "https://base.test/clipgringa-acesso")
    with pytest.raises(member_access.MemberCheckError):
        await member_access.check_remote(db, ["a@x.com"], transport=httpx.MockTransport(lambda request: response))


async def test_conferencia_desligada(monkeypatch):
    monkeypatch.setenv("MEMBER_CHECK_URL", "off")
    assert member_access.enabled() is False
    monkeypatch.delenv("MEMBER_CHECK_URL")
    assert member_access.check_url() == member_access.DEFAULT_CHECK_URL


# --- Pedido de link ----------------------------------------------------------------------------------------------------

async def test_assinante_ativo_sem_conta_recebe_o_link(db):
    email = _email("novo")
    db.track(email)
    decision = await member_access.login_decision(db, email.upper(), checker=checker(default=ACTIVE))
    assert (decision.action, decision.name) == ("send", "Marina")
    row = await db.row(email)
    assert row is not None and row[0] is True and row[2] == "Marina"


async def test_quem_nao_e_assinante_e_nao_tem_conta_nao_recebe_nada(db):
    email = _email("fora")
    decision = await member_access.login_decision(db, email, checker=checker())
    assert decision.action == "skip"
    assert await db.row(email) is None


async def test_sem_conta_e_base_fora_do_ar_nao_cria_acesso(db):
    email = _email("basefora")
    decision = await member_access.login_decision(db, email, checker=checker(fail=True))
    assert decision.action == "skip" and await db.row(email) is None


async def test_conta_convidada_continua_entrando_sem_consultar_a_base(db):
    email = _email("convidado")
    await db.add_user(email)
    calls = []
    decision = await member_access.login_decision(db, email, checker=checker(calls=calls))
    assert decision.action == "send" and calls == []


async def test_administrador_sempre_recebe(db):
    email = _email("admin")
    await db.add_user(email, admin=True)
    await db.add_row(email, active=False)
    calls = []
    assert (await member_access.login_decision(db, email, checker=checker(calls=calls))).action == "send"
    assert calls == []


@pytest.mark.parametrize("status,expected", [("pending", "skip"), ("declined", "skip"), ("approved", "send")])
async def test_cadastro_da_captura(db, status, expected):
    email = _email(status)
    await db.add_user(email, signup=status)
    assert (await member_access.login_decision(db, email, checker=checker(default=CANCELLED))).action == expected


async def test_assinante_que_cancelou_perde_o_acesso_no_pedido_de_link(db):
    email = _email("cancelou")
    user_id = await db.add_user(email)
    await db.add_row(email, active=True)
    decision = await member_access.login_decision(db, email, checker=checker(default=CANCELLED))
    assert decision.action == "inactive" and decision.why == "cancelou"
    row = await db.row(email)
    assert row[0] is False and row[1] == "cancelou" and row[4] is not None
    assert await db.open_sessions(user_id) == 0 and await db.live_keys(user_id) == 0


async def test_assinante_que_voltou_a_pagar_recebe_o_link_de_novo(db):
    email = _email("voltou")
    await db.add_user(email, session=False)
    await db.add_row(email, active=False)
    assert (await member_access.login_decision(db, email, checker=checker(default=ACTIVE))).action == "send"
    row = await db.row(email)
    assert row[0] is True and row[4] is None


async def test_acesso_mantido_pelo_administrador_nao_e_conferido(db):
    email = _email("mantido")
    await db.add_user(email)
    await db.add_row(email, active=False, exempt=True)
    calls = []
    assert (await member_access.login_decision(db, email, checker=checker(calls=calls))).action == "send"
    assert calls == []


async def test_base_fora_do_ar_vale_a_ultima_situacao(db):
    ativo, inativo = _email("ultimo-ativo"), _email("ultimo-inativo")
    user_id = await db.add_user(ativo)
    await db.add_row(ativo, active=True)
    await db.add_user(inativo)
    await db.add_row(inativo, active=False)
    assert (await member_access.login_decision(db, ativo, checker=checker(fail=True))).action == "send"
    assert (await member_access.login_decision(db, inativo, checker=checker(fail=True))).action == "inactive"
    assert await db.open_sessions(user_id) == 1


# --- Varredura ---------------------------------------------------------------------------------------------------------

async def test_varredura_tira_o_acesso_so_de_quem_entrou_como_assinante(db):
    lost, kept, admin, approved, exempt = (_email(t) for t in ("v-perdeu", "v-ativo", "v-admin", "v-liberado", "v-mantido"))
    ids = {e: await db.add_user(e, admin=(e == admin), signup=("approved" if e == approved else None)) for e in (lost, kept, admin, approved, exempt)}
    for e in (lost, kept, admin, approved):
        await db.add_row(e, active=True)
    await db.add_row(exempt, active=True, exempt=True)
    invited = _email("v-convidado")
    invited_id = await db.add_user(invited)  # sem linha em member_access: nem é consultado
    calls = []

    done = await member_access.sweep(db, checker=checker({kept: ACTIVE}, default=CANCELLED, calls=calls))

    assert invited not in calls[0] and done["checked"] == 5 and done["lost"] == 4
    assert await db.open_sessions(ids[lost]) == 0 and await db.live_keys(ids[lost]) == 0
    for e in (kept, admin, approved, exempt):
        assert await db.open_sessions(ids[e]) == 1, e
        assert await db.live_keys(ids[e]) == 1, e
    assert await db.open_sessions(invited_id) == 1
    assert (await db.row(lost))[1] == "cancelou"


async def test_varredura_nao_derruba_todo_mundo_se_a_base_responder_torto(db):
    emails = [_email(f"massa{i}") for i in range(12)]
    ids = [await db.add_user(e, api_key=False) for e in emails]
    for e in emails:
        await db.add_row(e, active=True)

    done = await member_access.sweep(db, checker=checker(default={"ativo": False, "motivo": "nao_e_membro"}))

    assert done.get("held") == 12 and done["closed"] == 0
    assert all([await db.open_sessions(i) == 1 for i in ids])
    assert all([(await db.row(e))[0] is True for e in emails])


async def test_varredura_com_base_fora_nao_altera_nada(db):
    email = _email("v-fora")
    user_id = await db.add_user(email)
    await db.add_row(email, active=True)
    with pytest.raises(member_access.MemberCheckError):
        await member_access.sweep(db, checker=checker(fail=True))
    assert await db.open_sessions(user_id) == 1 and (await db.row(email))[0] is True


# --- Rotas e e-mails ---------------------------------------------------------------------------------------------------

@pytest.fixture()
async def client(app, db):
    """Cliente das rotas usando a mesma conexão de banco do teste."""
    async def same_session():
        yield db

    app.dependency_overrides[get_db] = same_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as http:
            yield http
    finally:
        app.dependency_overrides.pop(get_db, None)


async def test_rota_do_link_exige_o_servidor_do_site(client):
    response = await client.post("/access/login-link", json={"email": "a@x.com", "url": "https://site.test/entrar/confirmar?token=abc"})
    assert response.status_code == 401


async def test_rota_manda_o_link_e_segura_pedidos_repetidos(client, auth_headers, db, tmp_path, monkeypatch):
    monkeypatch.setenv("EMAIL_OUTBOX_DIR", str(tmp_path))
    monkeypatch.setattr(access_routes, "_sent", {})
    email = _email("rota")
    await db.add_user(email)
    link = "https://site.test/entrar/confirmar?token=abc123"

    first = await client.post("/access/login-link", json={"email": email, "url": link}, headers=auth_headers)
    again = await client.post("/access/login-link", json={"email": email, "url": link}, headers=auth_headers)

    assert first.json() == {"status": "send"} and again.json() == {"status": "throttled"}
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    sent = json.loads(files[0].read_text(encoding="utf-8"))
    assert sent["to"] == email and link in sent["text"] and "WhatsApp (11) 91314-2143" in sent["text"]


async def test_rota_nao_revela_se_o_email_existe(client, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setenv("EMAIL_OUTBOX_DIR", str(tmp_path))
    monkeypatch.setenv("MEMBER_CHECK_URL", "off")
    monkeypatch.setattr(access_routes, "_sent", {})
    response = await client.post("/access/login-link", json={"email": _email("ninguem"), "url": "https://site.test/x"}, headers=auth_headers)
    assert response.status_code == 200 and response.json() == {"status": "skip"}
    assert list(tmp_path.glob("*.json")) == []


async def test_chave_publica_e_aberta(client):
    response = await client.get("/access/public-key")
    assert response.status_code == 200 and response.json()["alg"] == "Ed25519"
    assert len(base64.b64decode(response.json()["public_key"])) == 32


def test_limite_por_email():
    access_routes._sent.clear()
    assert access_routes._throttled("a@x.com", now=1000.0) is False
    assert access_routes._throttled("a@x.com", now=1010.0) is True       # menos de 45 s
    assert access_routes._throttled("b@x.com", now=1010.0) is False      # outro e-mail não é afetado
    for i in range(1, 6):
        assert access_routes._throttled("a@x.com", now=1000.0 + i * 60) is False
    assert access_routes._throttled("a@x.com", now=1000.0 + 6 * 60) is True  # 6 na última hora
    assert access_routes._throttled("a@x.com", now=1000.0 + 3700) is False


def test_textos_dos_emails():
    service = LoginLinkEmailService.__new__(LoginLinkEmailService)
    link = service.build_link_email("Marina Souza", "https://site.test/entrar/confirmar?token=a&b=1")
    assert link.subject == "Seu link para entrar no ClipGringa"
    assert "Olá, Marina!" in link.text and "15 minutos" in link.text and "token=a&amp;b=1" in link.html
    inactive = service.build_inactive_email(None)
    assert "assinatura da Gringatools ativa" in inactive.text and "wa.me/5511913142143" in inactive.html and inactive.text.startswith("Olá.")
