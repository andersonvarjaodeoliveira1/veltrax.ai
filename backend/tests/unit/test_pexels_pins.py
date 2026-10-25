import asyncio

from src.api.routes.clone_plan import PIN_HOSTS, _pexels_pins


def test_no_key_or_queries_gives_no_pins():
    assert asyncio.run(_pexels_pins(["a"], "")) == []
    assert asyncio.run(_pexels_pins([], "k")) == []


def test_pexels_host_is_accepted_for_download():
    assert "images.pexels.com" in PIN_HOSTS and "i.pinimg.com" in PIN_HOSTS
