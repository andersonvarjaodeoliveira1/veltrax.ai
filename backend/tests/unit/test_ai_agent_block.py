"""Robô ou agente de IA usando a conta de um membro: bloqueio na hora e valendo no servidor."""
import hashlib
import hmac
import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from src import security_alerts
from src.database import get_db


def signed(user_id: str) -> dict[str, str]:
    stamp = str(int(time.time()))
    signature = hmac.new(b"test-backend-auth-secret", f"{user_id}:{stamp}".encode(), hashlib.sha256).hexdigest()
    return {"x-clipgringa-user-id": user_id, "x-clipgringa-ts": stamp, "x-clipgringa-signature": signature}


@pytest.fixture()
async def site(app, db_session, monkeypatch):
    monkeypatch.setattr(security_alerts, "buffer", security_alerts.AlertBuffer())
    await db_session.execute(text('''
        CREATE TABLE IF NOT EXISTS session (
            id VARCHAR(36) PRIMARY KEY, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, token VARCHAR(255) UNIQUE NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "ipAddress" VARCHAR(255), "userAgent" TEXT, "userId" VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE)'''))

    async def add_user(admin=False):
        user_id = str(uuid.uuid4())
        await db_session.execute(text('INSERT INTO users (id, name, email, is_admin, "emailVerified") VALUES (:i, \'Pessoa\', :e, :a, TRUE)'),
                                 {"i": user_id, "e": f"ia-{user_id[:8]}@clipgringa.test", "a": admin})
        await db_session.execute(text('INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES (:i, NOW() + interval \'7 days\', :t, NOW(), NOW(), :u)'),
                                 {"i": str(uuid.uuid4()), "t": uuid.uuid4().hex, "u": user_id})
        await db_session.commit()
        return user_id

    async def sessions(user_id):
        return (await db_session.execute(text('SELECT COUNT(*) FROM session WHERE "userId" = :u'), {"u": user_id})).scalar()

    async def same_session():
        yield db_session

    app.dependency_overrides[get_db] = same_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as http:
            http.add_user, http.sessions = add_user, sessions  # type: ignore[attr-defined]
            yield http
    finally:
        app.dependency_overrides.pop(get_db, None)
        await db_session.rollback()
        await db_session.execute(text("DELETE FROM security_strikes WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'ia-%@clipgringa.test')"))
        await db_session.execute(text("DELETE FROM users WHERE email LIKE 'ia-%@clipgringa.test'"))
        await db_session.commit()


async def test_agente_de_ia_bloqueia_a_conta_na_hora_e_encerra_a_sessao(site):
    user_id = await site.add_user()
    response = await site.post("/security/report", json={"kind": "ai_agent", "page": "/automacao", "detail": "https://chatgpt.com"}, headers=signed(user_id))
    assert response.json() == {"ok": True, "strikes": 2, "blocked": True, "limit": 2}
    assert await site.sessions(user_id) == 0
    assert (await site.get("/security/status", headers=signed(user_id))).json()["blocked"] is True
    kinds = [event["kind"] for event in security_alerts.buffer.events]
    assert "ai_agent" in kinds and "blocked" in kinds


async def test_arquivo_isca_conta_como_tentativa_e_so_bloqueia_na_segunda(site):
    user_id = await site.add_user()
    first = await site.post("/security/report", json={"kind": "ai_probe", "page": "/llms.txt"}, headers=signed(user_id))
    assert first.json()["strikes"] == 1 and first.json()["blocked"] is False
    assert await site.sessions(user_id) == 1
    second = await site.post("/security/report", json={"kind": "devtools_shortcut", "page": "/"}, headers=signed(user_id))
    assert second.json()["blocked"] is True and await site.sessions(user_id) == 0


async def test_administrador_nunca_e_bloqueado(site):
    admin = await site.add_user(admin=True)
    response = await site.post("/security/report", json={"kind": "ai_agent", "page": "/"}, headers=signed(admin))
    assert response.json()["blocked"] is False and await site.sessions(admin) == 1


async def test_robo_sem_conta_vira_alerta_para_o_administrador(site):
    refused = await site.post("/security/visit", json={"kind": "ai_visit", "ip": "203.0.113.9", "page": "/sign-in"})
    assert refused.status_code == 401  # só o site avisa
    ok = await site.post("/security/visit", json={"kind": "ai_visit", "ip": "203.0.113.9", "page": "/sign-in?x=1", "detail": "ChatGPT-User/1.0"}, headers=signed("site"))
    assert ok.json() == {"ok": True}
    event = security_alerts.buffer.events[-1]
    assert (event["kind"], event["who"]) == ("ai_visit", "203.0.113.9") and "?x=1" not in event["detail"]
    assert (await site.post("/security/visit", json={"kind": "blocked", "ip": "x"}, headers=signed("site"))).status_code == 400


def test_textos_dos_alertas_novos():
    for kind in ("ai_agent", "ai_probe", "ai_visit", "ai_probe_visit"):
        assert kind in security_alerts.KINDS
    assert set(security_alerts.INSTANT_BLOCK_KINDS) == {"automation", "ai_agent"}
