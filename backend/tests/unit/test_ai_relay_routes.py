"""O cabeçalho x-ai-path diz por onde a IA respondeu (API, conta ou plano)."""
from fastapi import Request
from fastapi.testclient import TestClient

from src import ai_relay
from src.main import create_app


def test_x_ai_path_header_is_added_by_the_middleware():
    app = create_app()

    @app.get("/__t/path")
    async def with_path():
        ai_relay.set_ai_path("account:gemini")
        return {"ok": True}

    @app.get("/__t/none")
    async def without_path(request: Request):
        return {"ok": True}

    client = TestClient(app)  # sem "with": não sobe o banco
    assert client.get("/__t/path").headers.get("x-ai-path") == "account:gemini"
    assert client.get("/__t/none").headers.get("x-ai-path") is None
