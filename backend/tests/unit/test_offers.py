import pytest
from fastapi import HTTPException

from src.api.routes import offers


def test_routes_are_registered():
    paths = {(m, r.path) for r in offers.router.routes for m in r.methods}
    assert ("GET", "/multiplier/offers") in paths
    assert ("POST", "/multiplier/offers") in paths
    assert ("PUT", "/multiplier/offers/{offer_id}") in paths
    assert ("DELETE", "/multiplier/offers/{offer_id}") in paths


def test_clean_limits_and_uppercases_the_keyword():
    out = offers._clean({"name": "  Lençol  ", "keyword": "quero", "approved_copy": "x" * 9000})
    assert out["name"] == "Lençol"
    assert out["keyword"] == "QUERO"
    assert len(out["approved_copy"]) == 6000
    assert out["language"] == "pt-BR"


def test_clean_requires_a_name():
    with pytest.raises(HTTPException) as err:
        offers._clean({"name": "  "})
    assert err.value.status_code == 400


import asyncio
import inspect


def test_user_id_helper_is_async_and_takes_the_db():
    # Foi o erro que derrubou a página em produção: o helper é assíncrono e recebe o banco.
    assert inspect.iscoroutinefunction(offers._user_id)
    assert list(inspect.signature(offers._user_id).parameters) == ["request", "db"]


def test_list_offers_awaits_the_user_and_scopes_the_query(monkeypatch):
    seen = {}

    async def fake_user(request, db):
        return "user-1"

    class FakeDb:
        async def execute(self, statement, params=None):
            seen.update(params or {})
            return []

    monkeypatch.setattr(offers, "_user_id", fake_user)
    result = asyncio.run(offers.list_offers(object(), FakeDb()))
    assert result == {"offers": []}
    assert seen["u"] == "user-1"
