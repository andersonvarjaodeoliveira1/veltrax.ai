import json

import httpx
import pytest
from fastapi import HTTPException

from src import kie


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_credits_reads_balance_and_rejects_bad_key():
    async def ok(request):
        assert request.headers["authorization"] == "Bearer k1"
        return httpx.Response(200, json={"code": 200, "msg": "success", "data": 100.5})

    async with _client(ok) as c:
        assert await kie.credits("k1", c) == 100.5

    async def bad(request):
        return httpx.Response(200, json={"code": 401, "msg": "You do not have access permissions"})

    async with _client(bad) as c:
        with pytest.raises(HTTPException) as exc:
            await kie.credits("nope", c)
    assert exc.value.status_code == 401


async def test_create_task_and_error_mapping():
    seen = {}

    async def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"code": 200, "msg": "success", "data": {"taskId": "t123"}})

    async with _client(handler) as c:
        assert await kie.create_task(c, "k", "nano-banana-2", {"prompt": "x"}) == "t123"
    assert seen["body"] == {"model": "nano-banana-2", "input": {"prompt": "x"}}

    async def broke(request):
        return httpx.Response(200, json={"code": 402, "msg": "Insufficient credits"})

    async with _client(broke) as c:
        with pytest.raises(HTTPException) as exc:
            await kie.create_task(c, "k", "m", {})
    assert exc.value.status_code == 402 and "créditos" in exc.value.detail


async def test_wait_result_returns_urls_and_reports_failure(monkeypatch):
    monkeypatch.setattr(kie, "POLL_FIRST_SECONDS", 0.0)
    answers = iter([
        {"code": 200, "data": {"state": "generating"}},
        {"code": 200, "data": {"state": "success", "resultJson": json.dumps({"resultUrls": ["https://x/a.png"]})}},
    ])

    async def handler(request):
        return httpx.Response(200, json=next(answers))

    async with _client(handler) as c:
        assert await kie.wait_result(c, "k", "t") == ["https://x/a.png"]

    async def failed(request):
        return httpx.Response(200, json={"code": 200, "data": {"state": "fail", "failMsg": "blocked"}})

    async with _client(failed) as c:
        with pytest.raises(HTTPException) as exc:
            await kie.wait_result(c, "k", "t")
    assert exc.value.status_code == 422
