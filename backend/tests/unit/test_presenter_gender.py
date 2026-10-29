from types import SimpleNamespace

from src.api.routes import clone_plan


def test_context_keeps_only_a_valid_presenter():
    base = {"reference": "x" * 30, "keyword": "QUERO"}
    assert clone_plan._context({**base, "presenter": "woman"})["presenter"] == "woman"
    assert clone_plan._context({**base, "presenter": "man"})["presenter"] == "man"
    assert clone_plan._context({**base, "presenter": "robot"})["presenter"] == ""
    assert clone_plan._context(base)["presenter"] == ""


async def test_variations_prompt_demands_the_chosen_gender(monkeypatch):
    seen = {}

    async def fake_run(system, output_type, prompt, model=None):
        seen["prompt"] = prompt
        return SimpleNamespace(items=[SimpleNamespace(title="t", avatar="Ana", look="woman 30", setting="s", summary="x")] * 2)

    monkeypatch.setattr(clone_plan, "_run", fake_run)
    ctx = clone_plan._context({"reference": "x" * 30, "keyword": "QUERO", "count": 2, "presenter": "woman"})
    await clone_plan.stage_variations(ctx, [{"what": "a", "line": "b"}])
    assert "every avatar is a woman" in seen["prompt"]
    ctx = clone_plan._context({"reference": "x" * 30, "keyword": "QUERO", "count": 2})
    await clone_plan.stage_variations(ctx, [{"what": "a", "line": "b"}])
    assert "PRESENTER" not in seen["prompt"]
