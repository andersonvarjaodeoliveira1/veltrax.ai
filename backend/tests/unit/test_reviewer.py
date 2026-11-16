"""Conta de demonstração do revisor da Meta: páginas de exemplo e referências iniciais."""
import httpx
import pytest

from src import reviewer
from src.config import Config


class Result:
    def __init__(self, rows=None, scalar=None):
        self._rows, self._scalar = rows or [], scalar

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        return self._scalar

    def mappings(self):
        return self

    def all(self):
        return self._rows


class FakeDb:
    """Responde pelas palavras da consulta e guarda o que foi inserido."""

    def __init__(self, *, email="revisor@exemplo.com", user="u-rev", references=0, pages=None):
        self.email, self.user, self.references, self.pages = email, user, references, pages or []
        self.inserted, self.commits = [], 0

    async def execute(self, statement, params=None):
        sql = str(statement)
        if "INSERT INTO creative_bank" in sql:
            self.inserted.append(params)
            return Result([params])
        if "COUNT(*) FROM creative_bank" in sql:
            return Result(scalar=self.references)
        if "FROM fb_pages" in sql:
            return Result(self.pages)
        if "LOWER(email) FROM users" in sql:
            return Result([(self.email,)])
        if "FROM users WHERE LOWER(email)" in sql:
            return Result([(self.user,)] if params["e"] == self.email else [])
        raise AssertionError(sql)

    async def commit(self):
        self.commits += 1


PAGES = [{"name": "Aline Silva", "meta_page_id": "11", "meta_token_enc": "enc-a"}, {"name": "Body Explained", "meta_page_id": "22", "meta_token_enc": "enc-b"},
         {"name": "Narguile2.0", "meta_page_id": "33", "meta_token_enc": "enc-c"}]


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    values = {"META_REVIEWER_EMAIL": " Revisor@Exemplo.com ", "META_REVIEWER_PAGES": "body explained,  Aline  Silva; Página Que Não Existe"}
    monkeypatch.setattr(Config, "_get_runtime_setting", staticmethod(lambda key: values.get(key, "")))
    monkeypatch.setattr("src.runtime_settings.decrypt_setting_value", lambda value: f"tok-{value}")
    reviewer._last_seed_try.clear()
    return values


def test_names_and_pages_follow_what_the_admin_wrote():
    assert reviewer.reviewer_email() == "revisor@exemplo.com"
    assert reviewer.demo_names() == ["body explained", "Aline Silva", "Página Que Não Existe"]
    assert [p["name"] for p in reviewer.pick_pages(PAGES, reviewer.demo_names())] == ["Body Explained", "Aline Silva"]


@pytest.mark.asyncio
async def test_only_the_configured_account_is_the_reviewer(settings):
    assert await reviewer.is_reviewer(FakeDb(), "u-rev") is True
    assert await reviewer.is_reviewer(FakeDb(email="outra@exemplo.com"), "u-x") is False
    settings["META_REVIEWER_EMAIL"] = ""
    assert await reviewer.is_reviewer(FakeDb(), "u-rev") is False


def test_seed_takes_the_strongest_posts_with_text_and_link():
    posts = [{"link": "https://fb/1", "text": "fraco", "engagement": 2, "reactions": 2}, {"link": "", "text": "sem link", "engagement": 99},
             {"link": "https://fb/3", "text": "", "engagement": 80}, {"link": "https://fb/4", "text": "forte", "engagement": 50, "reactions": 40, "comments": 6, "shares": 4},
             {"link": "https://fb/5", "text": "médio", "engagement": 9}]
    bodies = reviewer.seed_bodies("Body Explained", posts)
    assert [(b["link"], b["champion"]) for b in bodies] == [("https://fb/4", True), ("https://fb/5", False)]
    assert bodies[0] == {"link": "https://fb/4", "text": "forte", "advertiser": "Body Explained", "reactions": 40, "comments": 6, "shares": 4, "champion": True}


def _graph(request: httpx.Request) -> httpx.Response:
    page = request.url.path.split("/")[-2]
    if page == "11":
        return httpx.Response(400, json={"error": {"code": 190, "message": "expired"}})
    return httpx.Response(200, json={"data": [
        {"id": f"{page}_1", "message": "Three signs you need water", "permalink_url": f"https://www.facebook.com/{page}/posts/1", "reactions": {"summary": {"total_count": 30}}},
        {"id": f"{page}_2", "message": "Do this at night", "permalink_url": f"https://www.facebook.com/{page}/posts/2", "reactions": {"summary": {"total_count": 5}}},
        {"id": f"{page}_3", "message": "Third", "permalink_url": f"https://www.facebook.com/{page}/posts/3"}]})


@pytest.mark.asyncio
async def test_empty_reviewer_library_gets_examples_once_and_survives_a_failing_page():
    db = FakeDb(pages=PAGES)
    async with httpx.AsyncClient(transport=httpx.MockTransport(_graph)) as client:
        assert await reviewer.seed_references(db, "u-rev", client, now=1000.0) == 2   # Aline falhou, Body Explained entrou
        assert await reviewer.seed_references(db, "u-rev", client, now=1100.0) == 0   # dentro dos 10 minutos: nem tenta
    assert [(row["adv"], row["champ"], row["score"]) for row in db.inserted] == [("Body Explained", True, 30.0), ("Body Explained", False, 5.0)]
    assert all(row["u"] == "u-rev" and row["src"] == "manual" for row in db.inserted) and db.commits == 1


@pytest.mark.asyncio
async def test_a_library_that_already_has_references_is_left_alone():
    db = FakeDb(pages=PAGES, references=3)
    async with httpx.AsyncClient(transport=httpx.MockTransport(_graph)) as client:
        assert await reviewer.seed_references(db, "u-rev", client, now=5000.0) == 0
    assert db.inserted == []


@pytest.mark.asyncio
async def test_status_tells_what_is_ready_and_what_is_missing(settings):
    out = await reviewer.status(FakeDb(pages=PAGES, references=4))
    assert out == {"configured": True, "exists": True, "references": 4, "pages": ["Body Explained", "Aline Silva"], "missing_pages": ["Página Que Não Existe"]}
    settings["META_REVIEWER_EMAIL"] = "ninguem@exemplo.com"
    assert (await reviewer.status(FakeDb(pages=PAGES)))["exists"] is False
    settings["META_REVIEWER_EMAIL"] = ""
    assert (await reviewer.status(FakeDb()))["configured"] is False
