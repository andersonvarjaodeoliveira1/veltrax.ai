import asyncio

from pydantic import BaseModel
from pydantic_ai import Agent

from src.integrations import claude_model


class Out(BaseModel):
    x: str


def test_claude_sends_thinking_disabled_with_forced_tool(monkeypatch):
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
    assert sent["thinking"] == {"type": "disabled"}
    assert sent["tool_choice"]["type"] in ("any", "tool")


def test_build_model_for_anthropic_name_disables_thinking():
    from src.ai import _build_transcript_model
    from types import SimpleNamespace

    cfg = SimpleNamespace(llm="x", anthropic_api_key="sk-ant-test")
    model = _build_transcript_model(cfg, "anthropic:claude-sonnet-5-5")
    assert model.settings["anthropic_thinking"] == {"type": "disabled"}
