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


def test_coherence_route_is_registered_and_limited_per_account(monkeypatch):
    paths = {(m, r.path) for r in offers.router.routes for m in r.methods}
    assert ("POST", "/multiplier/offers/coherence") in paths
    monkeypatch.setattr(offers, "_coherence_calls", {})
    for _ in range(offers.COHERENCE_CHECKS_PER_HOUR):
        offers._check_coherence_rate("user-1")
    with pytest.raises(HTTPException) as err:
        offers._check_coherence_rate("user-1")
    assert err.value.status_code == 429
    offers._check_coherence_rate("user-2")  # o limite é por conta


def test_coherence_checks_the_link_of_the_message_without_saving(monkeypatch):
    async def fake_user(request, db):
        return "user-1"

    async def fake_check(product, copy, message):
        return {"level": "alinhado", "url": "https://loja.exemplo.com", "seen": [product, copy, message]}

    class FakeRequest:
        async def json(self):
            return {"product": " Lençol ", "approved_copy": "Troquei o lençol.", "dm_message": "Aqui: https://loja.exemplo.com"}

    class EmptyRequest:
        async def json(self):
            return {"dm_message": "https://loja.exemplo.com"}

    import src.landing_check as landing_check

    monkeypatch.setattr(offers, "_user_id", fake_user)
    monkeypatch.setattr(offers, "_coherence_calls", {})
    monkeypatch.setattr(landing_check, "check", fake_check)
    out = asyncio.run(offers.offer_coherence(FakeRequest(), db=None))  # db=None: a rota não toca no banco
    assert out["level"] == "alinhado" and out["seen"] == ["Lençol", "Troquei o lençol.", "Aqui: https://loja.exemplo.com"]
    with pytest.raises(HTTPException) as err:
        asyncio.run(offers.offer_coherence(EmptyRequest(), db=None))
    assert err.value.status_code == 400
