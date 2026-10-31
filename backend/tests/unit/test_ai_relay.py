import asyncio

import pytest
from pydantic import BaseModel
from pydantic_ai import Agent

from src import ai_relay
from src.ai_errors import ai_fail


class Copy(BaseModel):
    hooks: list[str]


@pytest.fixture(autouse=True)
def clean():
    ai_relay._slots.clear()
    yield
    ai_relay._slots.clear()


def test_extract_json_strips_fences_and_chatter():
    assert ai_relay.extract_json('Claro!\n```json\n{"a": 1}\n```\nPronto') == '{"a": 1}'
    assert ai_relay.extract_json('texto {"a": {"b": 2}} fim') == '{"a": {"b": 2}}'


def test_not_ready_until_the_page_polls_and_after_it_stops():
    assert ai_relay.ready_site("u1") == ""
    ai_relay.heartbeat("u1", "gemini")
    assert ai_relay.ready_site("u1") == "gemini"
    ai_relay._slots["u1"].seen -= ai_relay.READY_TTL + 1
    assert ai_relay.ready_site("u1") == ""
    assert ai_relay.account_model("u1") is None


async def _page(user_id: str, answer: str | None = None, error: str = "", site: str = "gemini"):
    job = await ai_relay.poll(user_id, site, wait=5)
    assert job is not None
    ai_relay.submit_result(user_id, job["id"], answer or "", error)
    return job


async def test_agent_generates_through_the_account():
    ai_relay.heartbeat("u1", "gemini")
    model = ai_relay.account_model("u1")
    assert model is not None and model.is_account_relay and model.site == "gemini"
    agent = Agent(model, output_type=Copy, system_prompt="Escreva ganchos.")
    page = asyncio.create_task(_page("u1", '```json\n{"hooks": ["a", "b"]}\n```'))
    result = await agent.run("produto: tênis")
    job = await page
    assert result.output.hooks == ["a", "b"]
    assert "Escreva ganchos." in job["prompt"] and "produto: tênis" in job["prompt"] and "hooks" in job["prompt"]
    assert ai_relay.path_of_model(model) == "account:gemini"


async def test_invalid_answer_is_retried_with_the_reason():
    ai_relay.heartbeat("u1", "chatgpt")
    agent = Agent(ai_relay.account_model("u1"), output_type=Copy, output_retries=2)

    async def page():
        first = await _page("u1", "não sei")
        second = await _page("u1", '{"hooks": ["ok"]}')
        return first, second

    task = asyncio.create_task(page())
    result = await agent.run("x")
    first, second = await task
    assert result.output.hooks == ["ok"]
    assert "recusada" in second["prompt"]


async def test_login_error_becomes_a_clear_account_message():
    ai_relay.heartbeat("u1", "claude")
    agent = Agent(ai_relay.account_model("u1"), output_type=Copy)
    asyncio.create_task(_page("u1", error="login", site="claude"))
    with pytest.raises(ai_relay.RelayError) as caught:
        await agent.run("x")
    assert ai_fail(caught.value, "fallback").detail == "AI_ACCOUNT:claude:login"


async def test_timeout_and_unknown_job():
    ai_relay.heartbeat("u1", "gemini")
    with pytest.raises(ai_relay.RelayError) as caught:
        await ai_relay.ask("u1", "", "x", timeout=0.05)
    assert caught.value.code == "timeout"
    assert ai_relay.submit_result("u1", "nope", "x") is False
    assert await ai_relay.poll("u1", "gemini", wait=0.05) is None


async def test_keeps_ready_while_a_request_is_running():
    ai_relay.heartbeat("u1", "gemini")
    task = asyncio.create_task(ai_relay.ask("u1", "", "x", timeout=1))
    await asyncio.sleep(0.01)
    ai_relay._slots["u1"].seen -= ai_relay.READY_TTL + 5
    assert ai_relay.ready_site("u1") == "gemini"
    await _page("u1", "ok")
    assert await task == "ok"


def test_path_labels():
    assert ai_relay.path_of_model(object()) == "plan"


def test_user_models_puts_the_api_before_the_account():
    from src import integrations
    from src.usage import set_usage_user

    set_usage_user("u1")
    integrations._current_keys.set({})
    assert integrations.user_models() == []
    ai_relay.heartbeat("u1", "gemini")
    only_account = integrations.user_models()
    assert [getattr(m, "is_account_relay", False) for m in only_account] == [True]
    assert integrations.user_models(include_account=False) == []
    integrations._current_keys.set({"openai": "sk-test-key-1234567890"})
    both = integrations.user_models()
    assert [getattr(m, "is_account_relay", False) for m in both] == [False, True]
    assert ai_relay.path_of_model(both[0]) == "api:chatgpt"
    integrations._current_keys.set({})


async def test_with_own_ai_falls_back_to_the_plan_and_reports_the_path(monkeypatch):
    from fastapi import HTTPException

    from src.api.routes import multiplier
    from src import integrations

    async def no_keys(db, user_id):
        integrations._current_keys.set({})
        return {}

    holder = ai_relay.start_path_tracking()
    seen = []

    async def run(model):
        seen.append(model)
        if getattr(model, "is_account_relay", False):
            raise HTTPException(status_code=502, detail="AI_ACCOUNT:gemini:login")
        return "texto"

    ai_relay.heartbeat("u9", "gemini")
    monkeypatch.setattr("src.integrations.load_user_keys", lambda db, uid: _after_set(uid, no_keys))
    out = await multiplier._with_own_ai(None, "u9", run)
    assert out == "texto"
    assert len(seen) == 2 and seen[-1] is None
    assert holder["path"] == "plan"


async def _after_set(uid, fn):
    from src.usage import set_usage_user

    set_usage_user(uid)
    return await fn(None, uid)


def test_account_runs_get_a_longer_timeout_than_apis():
    from types import SimpleNamespace

    assert ai_relay.run_timeout(SimpleNamespace(is_account_relay=True)) == ai_relay.RELAY_RUN_TIMEOUT
    assert ai_relay.run_timeout(object()) == ai_relay.API_RUN_TIMEOUT
    assert ai_relay.RELAY_RUN_TIMEOUT > ai_relay.ASK_TIMEOUT_IMAGES > ai_relay.ASK_TIMEOUT


async def test_ask_with_images_waits_longer_than_text(monkeypatch):
    waits = []
    real = asyncio.wait_for

    async def spy(awaitable, timeout):
        waits.append(timeout)
        raise asyncio.TimeoutError

    monkeypatch.setattr(asyncio, "wait_for", spy)
    ai_relay.heartbeat("u-img", "gemini")
    for images in (None, [{"mime": "image/png", "data": "AAAA"}]):
        try:
            await ai_relay.ask("u-img", "", "oi", images=images)
        except ai_relay.RelayError:
            pass
    monkeypatch.setattr(asyncio, "wait_for", real)
    assert waits == [ai_relay.ASK_TIMEOUT, ai_relay.ASK_TIMEOUT_IMAGES]
