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
