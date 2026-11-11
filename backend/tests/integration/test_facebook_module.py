from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import text

from src import facebook
from src.api.routes import facebook as routes
from tests.fixtures.factories import create_user


async def _clip(db, tmp_path, user_id="user-1"):
    path = tmp_path / "clip1.mp4"
    path.write_bytes(b"video")
    await db.execute(text("DELETE FROM tasks WHERE id = 'task-fb'"))
    await db.execute(text("DELETE FROM sources WHERE id = 'src-fb'"))
    await db.execute(text("INSERT INTO sources (id, type, title) VALUES ('src-fb', 'youtube', 'Podcast')"))
    await db.execute(text("INSERT INTO tasks (id, user_id, source_id, status) VALUES ('task-fb', :u, 'src-fb', 'completed')"), {"u": user_id})
    await db.execute(text("""INSERT INTO generated_clips (id, task_id, filename, file_path, start_time, end_time, duration, text, relevance_score, clip_order, hook_title)
        VALUES ('clip-fb', 'task-fb', 'clip1.mp4', :p, '00:00', '00:30', 30, 'Your heart beats a lot', 0.9, 1, 'Heart fact')"""), {"p": str(path)})
    await db.commit()


@pytest.mark.asyncio
async def test_only_admins_reach_the_module(client, db_session, auth_headers):
    assert (await client.get("/facebook/overview")).status_code == 401
    await create_user(db_session, user_id="user-1", is_admin=False)
    assert (await client.get("/facebook/overview", headers=auth_headers)).status_code == 403


@pytest.mark.asyncio
async def test_full_flow_accounts_pages_clips_publish(client, db_session, auth_headers, tmp_path, monkeypatch):
    await create_user(db_session, user_id="user-1", is_admin=True)
    await create_user(db_session, user_id="user-2", email="other@example.com", is_admin=True)
    await _clip(db_session, tmp_path)

    r = await client.post("/facebook/accounts/sync", headers=auth_headers, json={"provider": "dolphin", "profiles": [{"external_id": "904", "name": "CONTA 01", "proxy": "br:8000"}]})
    assert r.json() == {"novas": 1, "atualizadas": 0}
    r = await client.post("/facebook/accounts/sync", headers=auth_headers, json={"provider": "dolphin", "profiles": [{"external_id": "904", "name": "Conta 01"}]})
    assert r.json() == {"novas": 0, "atualizadas": 1}
    ov = (await client.get("/facebook/overview", headers=auth_headers)).json()
    acc = ov["accounts"][0]
    assert acc["name"] == "Conta 01" and acc["status"] == "ativa"

    page = (await client.post("/facebook/pages", headers=auth_headers, json={"name": "Body Explained", "account_id": acc["id"], "niche": "Saúde"})).json()
    r = await client.post(f"/facebook/pages/{page['id']}/clips", headers=auth_headers, json={"clip_ids": ["clip-fb"]})
    assert r.status_code == 200 and r.json()["agendados"] == 1
    clips = (await client.get("/facebook/clips", headers=auth_headers)).json()["clips"]
    assert clips[0]["used_in"] == "Body Explained"

    # outra pessoa não vê nem mexe
    db = db_session
    other = dict(auth_headers)
    import hashlib
    import hmac
    import time as _t
    ts = str(int(_t.time()))
    other.update({"x-clipgringa-user-id": "user-2", "x-clipgringa-ts": ts, "x-clipgringa-signature": hmac.new(b"test-backend-auth-secret", f"user-2:{ts}".encode(), hashlib.sha256).hexdigest()})
    assert (await client.get("/facebook/overview", headers=other)).json() == {"accounts": [], "pages": []}
    assert (await client.post(f"/facebook/pages/{page['id']}/clips", headers=other, json={"clip_ids": ["clip-fb"]})).status_code == 404

    # conectar à Meta (token conferido) e publicar
    monkeypatch.setattr(routes, "check_page_token", AsyncMock(return_value={"id": "555", "name": "Body Explained"}))
    assert (await client.post(f"/facebook/pages/{page['id']}/meta", headers=auth_headers, json={"token": "x" * 40})).status_code == 200
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"id": "fb-1"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        # conta com restrição: segura
        await client.patch(f"/facebook/accounts/{acc['id']}", headers=auth_headers, json={"status": "restricao", "status_reason": "SMS"})
        assert (await facebook.publish_due(db, user_id="user-1", client=http))["enviados"] == 0
        await client.patch(f"/facebook/accounts/{acc['id']}", headers=auth_headers, json={"status": "ativa"})
        out = await facebook.publish_due(db, user_id="user-1", client=http)
    assert out == {"enviados": 1, "falharam": 0}
    assert len(calls) == 1 and b"scheduled_publish_time" in calls[0].content
    posts = (await client.get(f"/facebook/pages/{page['id']}/posts", headers=auth_headers)).json()["posts"]
    assert posts[0]["status"] == "agendado" and posts[0]["fb_post_id"] == "fb-1"
    ov = (await client.get("/facebook/overview", headers=auth_headers)).json()
    p = ov["pages"][0]
    assert p["meta_connected"] is True and "meta_token_enc" not in p and p["upcoming"] == 1
    assert any("Agendado no Facebook" in e["text"] for e in p["events"])
    assert any("com restrição" in e["text"] for e in ov["accounts"][0]["events"])
    stored = (await db.execute(text("SELECT meta_token_enc FROM fb_pages WHERE id = :id"), {"id": page["id"]})).scalar()
    assert stored and "x" * 40 not in stored


@pytest.mark.asyncio
async def test_failed_posts_stop_after_three_tries(db_session, auth_headers, client, tmp_path, monkeypatch):
    await create_user(db_session, user_id="user-1", is_admin=True)
    await _clip(db_session, tmp_path)
    page = (await client.post("/facebook/pages", headers=auth_headers, json={"name": "P"})).json()
    await client.post(f"/facebook/pages/{page['id']}/clips", headers=auth_headers, json={"clip_ids": ["clip-fb"]})
    monkeypatch.setattr(routes, "check_page_token", AsyncMock(return_value={"id": "1", "name": "P"}))
    await client.post(f"/facebook/pages/{page['id']}/meta", headers=auth_headers, json={"token": "y" * 40})
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(400, json={"error": {"code": 200}}))) as http:
        for _ in range(4):
            await facebook.publish_due(db_session, user_id="user-1", client=http)
    row = (await db_session.execute(text("SELECT status, attempts, error FROM fb_posts WHERE page_id = :p"), {"p": page["id"]})).mappings().first()
    assert row["status"] == "falhou" and row["attempts"] == 3 and "pages_manage_posts" in row["error"]
