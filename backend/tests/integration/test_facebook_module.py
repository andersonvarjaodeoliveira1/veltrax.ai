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


@pytest.mark.asyncio
async def test_ideas_plan_seed_and_organic_videos(client, db_session, auth_headers, tmp_path, monkeypatch):
    await create_user(db_session, user_id="user-1", is_admin=True)
    page = (await client.post("/facebook/pages", headers=auth_headers, json={"name": "Body Explained", "niche": "Saúde", "language": "en"})).json()

    from src.api.routes import clone_plan

    async def fake_run(system, output_type, prompt, model=None):
        assert "English" in system and "Saúde" in prompt
        return output_type(items=[{"title": "Why we yawn", "script": "Yawning cools the brain " * 5, "caption": "Did you know? #sleep #brain #body"}])

    monkeypatch.setattr(clone_plan, "_run", fake_run)
    r = await client.post(f"/facebook/pages/{page['id']}/ideas", headers=auth_headers)
    assert r.status_code == 200, r.text
    idea = r.json()["ideas"][0]
    assert idea["title"] == "Why we yawn" and idea["used"] is False
    r = await client.patch(f"/facebook/pages/{page['id']}/ideas/{idea['id']}", headers=auth_headers, json={"used": True})
    assert r.json()["ideas"][0]["used"] is True
    assert (await client.patch(f"/facebook/pages/{page['id']}", headers=auth_headers, json={"plan_seed": 3})).status_code == 200
    ov = (await client.get("/facebook/overview", headers=auth_headers)).json()["pages"][0]
    assert ov["plan_seed"] == 3 and ov["ideas"][0]["used"] is True

    video = tmp_path / "final.mp4"
    video.write_bytes(b"x")
    await db_session.execute(text("DELETE FROM final_videos WHERE id = 'fv-1'"))
    await db_session.execute(text("INSERT INTO final_videos (id, user_id, status, path, duration) VALUES ('fv-1', 'user-1', 'done', :p, 30)"), {"p": str(video)})
    await db_session.commit()
    listed = (await client.get("/facebook/clips", headers=auth_headers)).json()
    assert any(v["id"] == "fv-1" and v["source"] == "final" for v in listed["videos"])
    r = await client.post(f"/facebook/pages/{page['id']}/clips", headers=auth_headers,
                          json={"videos": [{"source": "final", "id": "fv-1"}], "title": "Why we yawn", "caption": "Did you know? #sleep"})
    assert r.json()["agendados"] == 1
    post = (await client.get(f"/facebook/pages/{page['id']}/posts", headers=auth_headers)).json()["posts"][0]
    assert post["title"] == "Why we yawn" and post["caption"] == "Did you know? #sleep"


@pytest.mark.asyncio
async def test_accounts_report_where_they_open_and_protection(client, db_session, auth_headers):
    await create_user(db_session, user_id="user-1", is_admin=True)
    await client.post("/facebook/accounts", headers=auth_headers, json={"name": "Jaah Alves"})
    await client.post("/facebook/accounts", headers=auth_headers, json={"name": "Perfil AdsPower", "provider": "adspower", "proxy": "us:9000"})
    assert (await client.post("/facebook/accounts", headers=auth_headers, json={"name": "X", "provider": "opera"})).status_code == 400
    await client.post("/facebook/accounts/sync", headers=auth_headers, json={"provider": "dolphin", "profiles": [{"external_id": "77", "name": "Dolphin sem proxy"}]})
    accounts = {a["name"]: a for a in (await client.get("/facebook/overview", headers=auth_headers)).json()["accounts"]}
    assert accounts["Jaah Alves"]["protection"] == "navegador"
    assert accounts["Perfil AdsPower"]["protection"] == "antidetect_proxy"
    assert accounts["Dolphin sem proxy"]["protection"] == "antidetect"
    # conta à mão pode mudar de navegador; a espelhada não
    await client.patch(f"/facebook/accounts/{accounts['Jaah Alves']['id']}", headers=auth_headers, json={"provider": "dicloak"})
    await client.patch(f"/facebook/accounts/{accounts['Dolphin sem proxy']['id']}", headers=auth_headers, json={"provider": "manual"})
    accounts = {a["name"]: a for a in (await client.get("/facebook/overview", headers=auth_headers)).json()["accounts"]}
    assert accounts["Jaah Alves"]["provider"] == "dicloak"
    assert accounts["Dolphin sem proxy"]["provider"] == "dolphin"


@pytest.mark.asyncio
async def test_login_with_facebook_maps_profile_and_pages(client, db_session, auth_headers, monkeypatch):
    from urllib.parse import unquote

    from src import facebook_meta

    await create_user(db_session, user_id="user-1", is_admin=True)
    monkeypatch.setattr(facebook_meta, "meta_app", lambda: None)
    assert (await client.get("/facebook/meta/status", headers=auth_headers)).json() == {"configured": False, "profiles": []}
    assert (await client.post("/facebook/meta/start", headers=auth_headers, json={"redirect_uri": "https://x.com/facebook/meta"})).status_code == 409

    monkeypatch.setattr(facebook_meta, "meta_app", lambda: ("123", "s3cret"))
    back = "https://clipgringa.gringatools.com/facebook/meta"
    assert (await client.post("/facebook/meta/start", headers=auth_headers, json={"redirect_uri": "https://evil.com/steal"})).status_code == 400
    url = (await client.post("/facebook/meta/start", headers=auth_headers, json={"redirect_uri": back})).json()["url"]
    assert "client_id=123" in url and "pages_manage_posts" in url and "s3cret" not in url
    state = unquote(url.split("state=")[1].split("&")[0])

    mine = (await client.post("/facebook/pages", headers=auth_headers, json={"name": "body explained"})).json()
    fb_pages = [{"id": "111", "name": "Body Explained", "token": "PAGE-TOKEN-111", "can_post": True},
                {"id": "222", "name": "The Curious Mind", "token": "PAGE-TOKEN-222", "can_post": True},
                {"id": "333", "name": "Só Leitura", "token": "PAGE-TOKEN-333", "can_post": False}]

    async def fake_exchange(code, redirect_uri, client=None):
        assert code == "CODE" and redirect_uri == back
        return {"user": {"id": "9", "name": "Jaah Alves"}, "token": "USER-TOKEN", "pages": fb_pages}

    async def fake_pages(token):
        assert token == "USER-TOKEN"
        renamed = [{**p, "name": "Mente Curiosa"} if p["id"] == "222" else p for p in fb_pages]
        return renamed + [{"id": "444", "name": "Página Nova", "token": "PAGE-TOKEN-444", "can_post": True}]

    async def fake_stats(page_id, token, client):
        return {"followers": 12, "normal": 9, "video": 2, "scheduled": 6, "has_photo": True, "has_cover": page_id == "222", "category": "Education",
                "language": "en" if page_id == "222" else None}

    names = {"on": False}

    async def fake_comments(page_id, token, client):
        if page_id != "111":
            return []
        # na primeira leitura o Facebook não entrega o nome; depois entrega
        return [{"id": "c1", "post_id": "111_1", "from_id": "u1" if names["on"] else "", "from_name": "Maria Souza" if names["on"] else "", "message": "Quero! SONO", "created_time": "2026-11-11T10:00:00+0000"},
                {"id": "c2", "post_id": "111_1", "from_id": "u2", "from_name": "João Lima", "message": "muito bom", "created_time": "2026-11-11T11:00:00+0000"}]

    from sqlalchemy import text as sql
    await db_session.execute(sql("DELETE FROM offers WHERE id = 'of-1'"))
    await db_session.execute(sql("INSERT INTO offers (id, user_id, name, product, keyword) VALUES ('of-1', 'user-1', 'Oferta sono', 'Guia do Sono', 'sono')"))
    await db_session.commit()
    monkeypatch.setattr(facebook_meta, "page_comments", fake_comments)
    monkeypatch.setattr(facebook_meta, "exchange", fake_exchange)
    monkeypatch.setattr(facebook_meta, "pages_of", fake_pages)
    monkeypatch.setattr(facebook_meta, "page_stats", fake_stats)
    assert (await client.post("/facebook/meta/finish", headers=auth_headers, json={"code": "CODE", "state": "1.2.3", "redirect_uri": back})).status_code == 400
    r = (await client.post("/facebook/meta/finish", headers=auth_headers, json={"code": "CODE", "state": state, "redirect_uri": back})).json()
    assert r == {"name": "Jaah Alves", "conectadas": ["body explained"], "novas": ["The Curious Mind", "Só Leitura"], "sem_permissao": ["Só Leitura"]}

    ov = (await client.get("/facebook/overview", headers=auth_headers)).json()
    assert [a["name"] for a in ov["accounts"]] == ["Jaah Alves"] and ov["accounts"][0]["pages"] == 3
    pages = {p["name"]: p for p in ov["pages"]}
    assert pages["body explained"]["id"] == mine["id"] and pages["body explained"]["meta_connected"]
    assert pages["body explained"]["account_name"] == "Jaah Alves"
    assert (pages["The Curious Mind"]["fb_posts_normal"], pages["The Curious Mind"]["fb_posts_video"], pages["The Curious Mind"]["fb_followers"]) == (9, 2, 12)
    assert not pages["Só Leitura"]["meta_connected"]
    assert "TOKEN" not in str(ov)

    # foto, capa, nicho e idioma vêm do Facebook; o que a pessoa já tinha escolhido fica
    assert (pages["The Curious Mind"]["has_photo"], pages["The Curious Mind"]["has_cover"], pages["The Curious Mind"]["niche"], pages["The Curious Mind"]["language"]) == (True, True, "Education", "en")
    assert (pages["Só Leitura"]["language"], pages["body explained"]["language"], pages["body explained"]["has_cover"]) == ("en", "en", False)
    got = (await client.get("/facebook/comments", headers=auth_headers)).json()
    assert got["total"] == 2 and got["products"] == [{"product": "Guia do Sono", "keyword": "sono", "total": 1, "people": 1}]
    lead = next(c for c in got["comments"] if c["keyword"])
    assert (lead["from_name"], lead["page_name"], lead["account_name"], lead["product"]) == ("", "body explained", "Jaah Alves", "Guia do Sono")
    names["on"] = True

    # entrar de novo não duplica; Atualizar traz a página nova
    await client.post("/facebook/meta/finish", headers=auth_headers, json={"code": "CODE", "state": state, "redirect_uri": back})
    synced = (await client.post("/facebook/meta/sync", headers=auth_headers)).json()
    assert synced["novas"] == ["Página Nova"] and synced["expirados"] == []
    ov = (await client.get("/facebook/overview", headers=auth_headers)).json()
    assert len(ov["accounts"]) == 1 and len(ov["pages"]) == 4
    assert "Mente Curiosa" in {p["name"] for p in ov["pages"]} and "The Curious Mind" not in {p["name"] for p in ov["pages"]}
    got = (await client.get("/facebook/comments", headers=auth_headers)).json()
    assert got["total"] == 2 and next(c for c in got["comments"] if c["keyword"])["from_name"] == "Maria Souza"
    assert next(p for p in ov["pages"] if p["name"] == "Página Nova")["language"] == "pt-BR"
    status = (await client.get("/facebook/meta/status", headers=auth_headers)).json()
    assert [(p["name"], p["pages"]) for p in status["profiles"]] == [("Jaah Alves", 4)]
    assert (await client.delete(f"/facebook/meta/{status['profiles'][0]['id']}", headers=auth_headers)).status_code == 200
    assert (await client.post("/facebook/meta/sync", headers=auth_headers)).status_code == 409


@pytest.mark.asyncio
async def test_manual_posting_without_meta(client, db_session, auth_headers, tmp_path):
    from sqlalchemy import text as sql

    await create_user(db_session, user_id="user-1", is_admin=True)
    page = (await client.post("/facebook/pages", headers=auth_headers, json={"name": "Sem Meta"})).json()
    video = tmp_path / "v.mp4"
    video.write_bytes(b"video-bytes")
    await db_session.execute(sql("""INSERT INTO fb_posts (id, user_id, page_id, file_path, title, caption, scheduled_at)
        VALUES ('post-m', 'user-1', :p, :f, 'Meu vídeo', 'legenda', NOW())"""), {"p": page["id"], "f": str(video)})
    await db_session.commit()
    r = await client.get("/facebook/posts/post-m/file", headers=auth_headers)
    assert r.status_code == 200 and r.content == b"video-bytes" and "attachment" in r.headers["content-disposition"]
    assert (await client.post("/facebook/posts/post-m/done", headers=auth_headers)).status_code == 200
    assert (await client.post("/facebook/posts/post-m/done", headers=auth_headers)).status_code == 409
    ov = (await client.get("/facebook/overview", headers=auth_headers)).json()["pages"][0]
    assert ov["published"] == 1 and "postado à mão" in ov["events"][0]["text"]


@pytest.mark.asyncio
async def test_counts_by_kind_and_source(client, db_session, auth_headers, tmp_path):
    from sqlalchemy import text as sql

    await create_user(db_session, user_id="user-1", is_admin=True)
    page = (await client.post("/facebook/pages", headers=auth_headers, json={"name": "Números"})).json()
    await db_session.execute(sql("""INSERT INTO final_videos (id, user_id, status, path) VALUES ('fv-n', 'user-1', 'done', :f)
        ON CONFLICT (id) DO NOTHING"""), {"f": str(tmp_path / "x.mp4")})
    await db_session.commit()
    assert (await client.post(f"/facebook/pages/{page['id']}/clips", headers=auth_headers, json={"videos": [{"source": "final", "id": "fv-n"}]})).status_code == 200
    assert (await client.post(f"/facebook/pages/{page['id']}/posts/manual", headers=auth_headers, json={"kind": "imagem", "count": 9})).json() == {"registrados": 9}
    await client.post(f"/facebook/pages/{page['id']}/posts/manual", headers=auth_headers, json={"kind": "texto", "count": 2})
    assert (await client.post(f"/facebook/pages/{page['id']}/posts/manual", headers=auth_headers, json={"kind": "story"})).status_code == 400
    ov = (await client.get("/facebook/overview", headers=auth_headers)).json()["pages"][0]
    assert (ov["posts_normal"], ov["videos_cta"], ov["videos_cut"], ov["videos_manual"]) == (11, 1, 0, 0)
    assert ov["published"] == 11 and ov["upcoming"] == 1


@pytest.mark.asyncio
async def test_worker_refreshes_stale_page_numbers(client, db_session, auth_headers, monkeypatch):
    from sqlalchemy import text as sql

    from src import facebook_meta
    from src.runtime_settings import encrypt_setting_value

    await create_user(db_session, user_id="user-1", is_admin=True)
    page = (await client.post("/facebook/pages", headers=auth_headers, json={"name": "Com números"})).json()
    await db_session.execute(sql("UPDATE fb_pages SET meta_page_id = '77', meta_token_enc = :t WHERE id = :id"), {"t": encrypt_setting_value("TOK"), "id": page["id"]})
    await db_session.commit()

    async def fake_stats(page_id, token, client):
        assert (page_id, token) == ("77", "TOK")
        return {"followers": 5, "normal": 3, "video": 1, "scheduled": 0}

    async def no_comments(page_id, token, client):
        return []

    monkeypatch.setattr(facebook_meta, "page_stats", fake_stats)
    monkeypatch.setattr(facebook_meta, "page_comments", no_comments)
    assert await facebook_meta.refresh_stale_stats(db_session) >= 1
    assert await facebook_meta.refresh_stale_stats(db_session) == 0
    ov = next(p for p in (await client.get("/facebook/overview", headers=auth_headers)).json()["pages"] if p["id"] == page["id"])
    assert (ov["fb_posts_normal"], ov["fb_posts_video"], ov["fb_followers"]) == (3, 1, 5)


@pytest.mark.asyncio
async def test_week_calendar_lists_scheduled_posts(client, db_session, auth_headers):
    from sqlalchemy import text as sql

    await create_user(db_session, user_id="user-1", is_admin=True)
    page = (await client.post("/facebook/pages", headers=auth_headers, json={"name": "Calendário"})).json()
    await db_session.execute(sql("""INSERT INTO fb_posts (id, user_id, page_id, title, scheduled_at) VALUES
        ('cal-1', 'user-1', :p, 'Hoje', NOW() + interval '1 minute'), ('cal-2', 'user-1', :p, 'Longe', NOW() + interval '40 days')"""), {"p": page["id"]})
    await db_session.commit()
    await client.post(f"/facebook/pages/{page['id']}/posts/manual", headers=auth_headers, json={"kind": "texto", "count": 2})
    cal = (await client.get("/facebook/calendar?days=7", headers=auth_headers)).json()
    assert [(p["title"], p["page_name"]) for p in cal["posts"] if p["page_id"] == page["id"]] in ([("Hoje", "Calendário")], [])
    assert cal["days"] == 7


@pytest.mark.asyncio
async def test_private_reply_only_for_new_recent_keyword_comments(client, db_session, auth_headers, monkeypatch):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import text as sql

    from src import facebook_meta
    from src.runtime_settings import encrypt_setting_value

    await create_user(db_session, user_id="user-1", is_admin=True)
    page = (await client.post("/facebook/pages", headers=auth_headers, json={"name": "Com DM"})).json()
    await db_session.execute(sql("UPDATE fb_pages SET meta_page_id = '88', meta_token_enc = :t WHERE id = :id"), {"t": encrypt_setting_value("TOK"), "id": page["id"]})
    await db_session.execute(sql("UPDATE fb_pages SET fb_synced_at = NOW() WHERE id <> :id"), {"id": page["id"]})
    await db_session.execute(sql("DELETE FROM offers WHERE id = 'of-dm'"))
    await db_session.execute(sql("DELETE FROM fb_comments WHERE fb_comment_id IN ('dm-new', 'dm-old', 'dm-nokey', 'dm-fail')"))
    await db_session.execute(sql("""INSERT INTO offers (id, user_id, name, product, keyword, dm_message)
        VALUES ('of-dm', 'user-1', 'Oferta', 'Guia', 'QUERO', 'Aqui está o link: https://exemplo.com')"""))
    await db_session.commit()
    stamp = lambda delta: (datetime.now(UTC) - delta).strftime("%Y-%m-%dT%H:%M:%S+0000")  # noqa: E731
    batch = [{"id": "dm-new", "post_id": "88_1", "from_id": "u1", "from_name": "Ana", "message": "eu quero!", "created_time": stamp(timedelta(minutes=5))},
             {"id": "dm-old", "post_id": "88_1", "from_id": "u2", "from_name": "Bia", "message": "QUERO", "created_time": stamp(timedelta(days=3))},
             {"id": "dm-nokey", "post_id": "88_1", "from_id": "u3", "from_name": "Caio", "message": "legal", "created_time": stamp(timedelta(minutes=5))}]
    sent = []

    async def fake_stats(page_id, token, client):
        return {"followers": 1, "normal": 1, "video": 0, "scheduled": 0}

    async def fake_comments(page_id, token, client):
        return batch

    async def fake_send(page_id, token, comment_id, message, client):
        if comment_id == "dm-fail":
            raise ValueError("(#10) pages_messaging não liberada")
        sent.append((page_id, token, comment_id, message))

    monkeypatch.setattr(facebook_meta, "page_stats", fake_stats)
    monkeypatch.setattr(facebook_meta, "page_comments", fake_comments)
    monkeypatch.setattr(facebook_meta, "send_private_reply", fake_send)
    assert await facebook_meta.refresh_stale_stats(db_session) == 1
    assert sent == [("88", "TOK", "dm-new", "Aqui está o link: https://exemplo.com")]

    # na leitura seguinte ninguém recebe de novo; comentário novo que falha fica marcado
    batch.append({"id": "dm-fail", "post_id": "88_1", "from_id": "u4", "from_name": "Davi", "message": "quero", "created_time": stamp(timedelta(minutes=1))})
    await db_session.execute(sql("UPDATE fb_pages SET fb_synced_at = NULL WHERE id = :id"), {"id": page["id"]})
    await db_session.commit()
    await facebook_meta.refresh_stale_stats(db_session)
    assert len(sent) == 1
    got = {c["message"]: (c["dm_status"], c["dm_error"]) for c in (await client.get("/facebook/comments", headers=auth_headers)).json()["comments"] if c["page_id"] == page["id"]}
    assert got["eu quero!"] == ("enviada", "") and got["QUERO"] == ("", "") and got["legal"] == ("", "")
    assert got["quero"][0] == "falhou" and "pages_messaging" in got["quero"][1]
