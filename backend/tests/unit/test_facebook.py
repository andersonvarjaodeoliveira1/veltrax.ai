import itertools
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest

from src import facebook
from src.api.routes import facebook as routes
from src.facebook import BR, caption_for, day_slots, plan_times, send_post


def test_routes_are_registered():
    paths = {(m, r.path) for r in routes.router.routes for m in r.methods}
    for item in [("GET", "/facebook/overview"), ("POST", "/facebook/accounts/sync"), ("PATCH", "/facebook/accounts/{account_id}"),
                 ("POST", "/facebook/pages"), ("POST", "/facebook/pages/{page_id}/meta"), ("POST", "/facebook/pages/{page_id}/clips"),
                 ("GET", "/facebook/clips"), ("DELETE", "/facebook/posts/{post_id}"), ("POST", "/facebook/publish")]:
        assert item in paths


def test_day_slots_are_stable_varied_and_never_round():
    a = day_slots("page-1", date(2026, 11, 12), 3)
    assert a == day_slots("page-1", date(2026, 11, 12), 3)
    assert a != day_slots("page-2", date(2026, 11, 12), 3)
    assert [s.hour < 12 for s in a] == [True, False, False]
    assert 12 <= a[1].hour < 17 and 18 <= a[2].hour < 22
    assert all(s.minute % 5 for s in a)


def test_plan_times_respects_per_day_gap_and_now():
    now = datetime(2026, 11, 11, 21, 0, tzinfo=BR)
    times = plan_times("p", 3, 7, [], now)
    assert len(times) == 7
    assert times[0] >= now + timedelta(minutes=30)
    per_day = {}
    for t in times:
        per_day[t.date()] = per_day.get(t.date(), 0) + 1
    assert max(per_day.values()) <= 3
    assert all(b - a >= timedelta(minutes=90) for a, b in itertools.pairwise(times))


def test_plan_times_skips_taken_slots():
    now = datetime(2026, 11, 11, 6, 0, tzinfo=BR)
    first = plan_times("p", 2, 2, [], now)
    again = plan_times("p", 2, 2, first, now)
    assert not set(first) & set(again)
    assert again[0].date() > first[-1].date()


def test_caption_uses_hook_and_trims_text():
    cap = caption_for("Why sleep matters", "word " * 100)
    assert cap.startswith("Why sleep matters\n\n")
    assert cap.endswith("…") and len(cap) < 260
    assert caption_for(None, None) == ""


def test_account_age():
    assert routes.account_age(date(2023, 1, 10), date(2026, 3, 9)) == "3 anos e 1 mês"
    assert routes.account_age(date(2026, 11, 1), date(2026, 11, 11)) == "10 dias"
    assert routes.account_age(None) == ""


def test_parse_date_accepts_brazilian_format():
    assert routes._date("05/02/2021") == date(2021, 2, 5)
    with pytest.raises(routes.HTTPException):
        routes._date("31/02/2021")


@pytest.mark.asyncio
async def test_send_post_schedules_video(tmp_path):
    clip = tmp_path / "c.mp4"
    clip.write_bytes(b"x")
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["body"] = request.content
        return httpx.Response(200, json={"id": "vid1"})

    when = datetime(2026, 11, 12, 12, 0, tzinfo=UTC)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        out = await send_post(client, page_id="55", token="tok", kind="video", file_path=str(clip), caption="hi", when=when)
    assert out == "vid1"
    assert seen["url"].startswith(facebook.GRAPH_VIDEO) and seen["url"].endswith("/55/videos")
    assert b"scheduled_publish_time" in seen["body"] and str(int(when.timestamp())).encode() in seen["body"]


@pytest.mark.asyncio
async def test_send_post_translates_meta_errors(tmp_path):
    def handler(request):
        return httpx.Response(400, json={"error": {"code": 190, "message": "expired"}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="Token vencido"):
            await send_post(client, page_id="55", token="t", kind="texto", file_path=None, caption="x", when=None)


@pytest.mark.asyncio
async def test_send_post_missing_file():
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={}))) as client:
        with pytest.raises(ValueError, match="arquivo"):
            await send_post(client, page_id="1", token="t", kind="video", file_path="/nao/existe.mp4", caption="", when=None)


def test_protection_map():
    assert routes.protection_of("manual", "") == "navegador"
    assert routes.protection_of("manual", "br:8000") == "navegador"
    assert routes.protection_of("dolphin", "br:8000") == "antidetect_proxy"
    assert routes.protection_of("adspower", "  ") == "antidetect"
    assert routes.protection_of("multilogin", "") == "antidetect"


def test_meta_state_and_redirect(monkeypatch):
    from src import facebook_meta as meta

    monkeypatch.setenv("APP_SETTINGS_ENCRYPTION_KEY", "test-key-1234567890abcdef")
    st = meta.make_state("u1", now=1000)
    assert meta.check_state(st, "u1", now=1100)
    assert not meta.check_state(st, "u2", now=1100)
    assert not meta.check_state(st, "u1", now=1000 + meta.STATE_TTL + 1)
    assert not meta.check_state("lixo", "u1")
    assert meta.valid_redirect("https://clipgringa.gringatools.com/facebook/meta")
    assert meta.valid_redirect("http://localhost:3107/facebook/meta")
    assert not meta.valid_redirect("http://evil.com/facebook/meta")
    assert not meta.valid_redirect("https://evil.com/outra")
    assert not meta.valid_redirect("https://x.com/facebook/meta?next=1")


@pytest.mark.asyncio
async def test_meta_exchange_gets_long_token_and_pages(monkeypatch):
    from src import facebook_meta as meta

    monkeypatch.setattr(meta, "meta_app", lambda: ("APP", "SECRET"))
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path + "?" + str(request.url.query, "utf-8") if isinstance(request.url.query, bytes) else request.url.path)
        q = dict(request.url.params)
        if request.url.path.endswith("oauth/access_token") and q.get("code"):
            return httpx.Response(200, json={"access_token": "SHORT"})
        if request.url.path.endswith("oauth/access_token"):
            assert q["fb_exchange_token"] == "SHORT" and q["client_secret"] == "SECRET"
            return httpx.Response(200, json={"access_token": "LONG"})
        if request.url.path.endswith("/me"):
            return httpx.Response(200, json={"id": "9", "name": "Jaah"})
        if request.url.path.endswith("me/accounts"):
            assert q["access_token"] == "LONG"
            if q.get("after"):
                return httpx.Response(200, json={"data": [{"id": "2", "name": "B", "access_token": "T2", "tasks": ["ANALYZE"]}]})
            return httpx.Response(200, json={"data": [{"id": "1", "name": "A", "access_token": "T1", "tasks": ["CREATE_CONTENT"]}],
                                             "paging": {"cursors": {"after": "x"}, "next": "https://graph/next"}})
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        got = await meta.exchange("CODE", "https://x.com/facebook/meta", client)
    assert got["token"] == "LONG" and got["user"]["name"] == "Jaah"
    assert [(p["id"], p["can_post"]) for p in got["pages"]] == [("1", True), ("2", False)]

    def bad(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"code": 100, "message": "Invalid verification code"}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(bad)) as client:
        with pytest.raises(ValueError, match="Invalid verification code"):
            await meta.exchange("CODE", "https://x.com/facebook/meta", client)
