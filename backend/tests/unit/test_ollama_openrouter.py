import pytest
from fastapi import HTTPException

from src import integrations


def test_pack_and_unpack_ollama_keep_url_key_and_model():
    packed = integrations.pack_ollama("k123456789", "https://ollama.com/", "gpt-oss:120b")
    assert integrations.unpack_ollama(packed) == {"url": "https://ollama.com", "key": "k123456789", "model": "gpt-oss:120b"}
    assert integrations.unpack_ollama("so-a-chave")["url"] == integrations.DEFAULT_OLLAMA_URL


def test_pick_model_prefers_known_families():
    assert integrations.pick_ollama_model(["foo:1b", "gpt-oss:120b"]) == "gpt-oss:120b"
    assert integrations.pick_ollama_model(["foo:1b"]) == "foo:1b"
    assert integrations.pick_ollama_model([]) == ""


def test_user_models_include_openrouter_and_ollama_before_the_account():
    integrations._current_keys.set({
        "openrouter": "sk-or-test-1234567890",
        "ollama": integrations.pack_ollama("abc12345", "https://ollama.com", "gpt-oss:120b"),
    })
    names = [type(m).__name__ for m in integrations.user_models(include_account=False)]
    assert names == ["OpenRouterModel", "OllamaModel"]
    integrations._current_keys.set({"ollama": integrations.pack_ollama("abc12345", "https://ollama.com", "")})
    assert integrations.user_models(include_account=False) == []  # sem modelo escolhido não entra
    integrations._current_keys.set({})


async def test_probe_rejects_http_and_private_addresses():
    ok, reason, _ = await integrations.ollama_probe("http://ollama.example.com", "")
    assert not ok and "https" in reason
    ok, reason, _ = await integrations.ollama_probe("https://127.0.0.1", "")
    assert not ok and "localhost" in reason


async def test_connect_ollama_checks_and_stores_the_chosen_model(monkeypatch):
    from starlette.requests import Request

    from src.api.routes import integrations as route

    saved = {}

    async def fake_probe(url, key):
        return True, "", ["llama3:8b", "gpt-oss:20b"]

    async def fake_save(db, user_id, provider, value, hint=None):
        saved.update(provider=provider, value=value, hint=hint)

    async def fake_list(db, user_id):
        return []

    monkeypatch.setattr(route, "ollama_probe", fake_probe)
    monkeypatch.setattr(route, "save_integration", fake_save)
    monkeypatch.setattr(route, "list_integrations", fake_list)
    monkeypatch.setattr(route, "_uid", lambda request: "u1")

    class Req:
        async def json(self):
            return {"key": "abc12345", "url": "", "model": ""}

    await route.connect("ollama", Req(), None)
    assert saved["provider"] == "ollama" and saved["hint"] == "gpt-oss:20b · ollama.com"
    assert integrations.unpack_ollama(saved["value"])["model"] == "gpt-oss:20b"

    class NoKey:
        async def json(self):
            return {"key": "", "url": "", "model": ""}

    with pytest.raises(HTTPException) as caught:
        await route.connect("ollama", NoKey(), None)
    assert "chave" in caught.value.detail


def test_huggingface_model_uses_router_and_is_labeled():
    from src import integrations
    from src.ai_relay import path_of_model

    token = integrations._current_keys.set({"huggingface": "hf_abcdefghijkl"})
    try:
        models = integrations.user_models(include_account=False)
    finally:
        integrations._current_keys.reset(token)
    assert len(models) == 1
    assert path_of_model(models[0]) == "api:huggingface"
    assert "router.huggingface.co" in str(models[0]._provider.base_url)
