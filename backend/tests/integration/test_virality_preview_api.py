import pytest

from src.api.routes import clone_plan
from tests.fixtures.factories import create_user


@pytest.mark.asyncio
async def test_virality_preview_returns_scores_and_fixes(client, db_session, auth_headers, monkeypatch):
    await create_user(db_session, user_id="user-1")
    seen = {}

    async def fake_run(system, output_type, prompt, model=None):
        seen["prompt"] = prompt
        return output_type(
            attention={"score": 80, "note": "Abre com uma pergunta"}, emotion={"score": 60, "note": "x"}, memory={"score": 40, "note": "x"},
            language={"score": 70, "note": "x"}, vision={"score": 50, "note": "x"}, sound={"score": 50, "note": "x"}, hold_rate=45,
            strongest_line="Yawning cools the brain.", drops=[{"quote": "in three steps", "why": "vira aula", "fix": "corte"}],
            fixes=["a", "b", "c", "d"], better_hook="Why do you yawn?", trending=["pergunta rápida"], verdict="Arrume o meio.")

    monkeypatch.setattr(clone_plan, "_run", fake_run)
    monkeypatch.setattr(clone_plan, "_check_script_rate", lambda user_id: None)
    assert (await client.post("/multiplier/clone/virality", headers=auth_headers, json={"script": "curto"})).status_code == 400
    r = await client.post("/multiplier/clone/virality", headers=auth_headers, json={"script": "Yawning cools the brain. Here is how it works in three steps.", "niche": "Saúde"})
    assert r.status_code == 200
    data = r.json()
    assert data["score"] == clone_plan.virality_total({"attention": 80, "emotion": 60, "memory": 40, "language": 70, "vision": 50, "sound": 50}) == 62
    assert data["hold_rate"] == 45 and data["regions"]["attention"] == {"score": 80, "note": "Abre com uma pergunta"}
    assert len(data["fixes"]) == 3 and data["drops"][0]["quote"] == "in three steps" and data["better_hook"] == "Why do you yawn?"
    assert "Niche: Saúde" in seen["prompt"]
