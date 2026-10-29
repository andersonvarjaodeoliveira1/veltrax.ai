import asyncio

from pydantic import BaseModel
from pydantic_ai.models.test import TestModel

from src.api.routes import clone_plan


class _Out(BaseModel):
    text: str


class _Quota(TestModel):
    async def request(self, *args, **kwargs):  # type: ignore[override]
        raise RuntimeError("429 RESOURCE_EXHAUSTED quota")


def test_run_parts_uses_next_model_when_quota_is_exhausted(monkeypatch):
    async def build():
        return _Quota()

    async def fallbacks():
        return [TestModel(custom_output_args={"text": "ok"})]

    monkeypatch.setattr(clone_plan, "_build_model", build)
    monkeypatch.setattr(clone_plan, "_fallback_models", fallbacks)
    monkeypatch.setattr("src.integrations.user_models", lambda **_k: [])
    monkeypatch.setattr("src.usage.server_blocked", lambda: False)

    async def no_usage(*a, **k):
        return None

    monkeypatch.setattr("src.usage.record_usage", no_usage)
    out = asyncio.run(clone_plan._run_parts("sys", _Out, ["hello"]))
    assert out.text == "ok"
