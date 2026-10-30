import asyncio

from pydantic import BaseModel
from pydantic_ai import Agent

from src.integrations import claude_model


class Out(BaseModel):
    x: str


def test_claude_sends_thinking_between_tools_with_forced_tool(monkeypatch):
    model = claude_model(api_key="sk-ant-test")
    sent = {}

    async def fake_create(self, *args, **kwargs):
        sent.update(kwargs)
        raise RuntimeError("stop")

    import anthropic.resources.beta.messages.messages as mm
    monkeypatch.setattr(mm.AsyncMessages, "create", fake_create)
    try:
        asyncio.run(Agent(model, output_type=Out).run("oi"))
    except Exception:
        pass
    assert sent["thinking"] == {"type": "between_tools"}
    assert sent["tool_choice"]["type"] == "auto"  # Sonnet 5.5 recusa tool_choice forçado


def test_build_model_for_anthropic_name_sets_thinking():
    from src.ai import _build_transcript_model
    from types import SimpleNamespace

    cfg = SimpleNamespace(llm="x", anthropic_api_key="sk-ant-test")
    model = _build_transcript_model(cfg, "anthropic:claude-sonnet-5-5")
    assert model.settings["anthropic_thinking"] == {"type": "between_tools"}


def test_claude_falls_back_to_disabled_when_api_rejects_thinking(monkeypatch):
    from pydantic_ai.exceptions import ModelHTTPError

    model = claude_model(api_key="sk-ant-test")
    seen = []

    async def fake_create(self, *args, **kwargs):
        seen.append(kwargs["thinking"]["type"])
        if kwargs["thinking"]["type"] == "between_tools":
            raise ModelHTTPError(400, "claude", {"error": {"message": "thinking.type invalid"}})
        raise RuntimeError("stop")

    import anthropic.resources.beta.messages.messages as mm
    monkeypatch.setattr(mm.AsyncMessages, "create", fake_create)
    try:
        asyncio.run(Agent(model, output_type=Out).run("oi"))
    except Exception:
        pass
    assert seen[:2] == ["between_tools", "disabled"]


def test_relay_carries_images_to_the_account_job():
    import asyncio as aio
    from pydantic_ai.messages import BinaryContent

    from src import ai_relay

    content = ["descreva", BinaryContent(data=b"\xff\xd8abc", media_type="image/jpeg")]
    imgs = ai_relay.images_of(content)
    assert imgs and imgs[0]["mime"] == "image/jpeg" and imgs[0]["data"]
    assert ai_relay.images_of("só texto") == []

    async def go():
        ai_relay.heartbeat("u1", "gemini")
        task = aio.create_task(ai_relay.ask("u1", "", "oi", timeout=2, images=imgs))
        job = await ai_relay.poll("u1", "gemini", 1)
        assert job and job["images"] == imgs
        ai_relay.submit_result("u1", job["id"], "ok")
        assert await task == "ok"

    aio.run(go())
