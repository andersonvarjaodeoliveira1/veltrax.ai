from src.api.routes import clone_plan


def test_virality_route_is_registered():
    assert "/multiplier/clone/virality" in {r.path for r in clone_plan.router.routes}


def test_total_weights_the_hook_most_and_stays_in_range():
    flat = dict.fromkeys(clone_plan.VIRAL_REGIONS, 50)
    assert clone_plan.virality_total(flat) == 50
    assert clone_plan.virality_total({**flat, "attention": 100}) > clone_plan.virality_total({**flat, "sound": 100})
    assert clone_plan.virality_total(dict.fromkeys(clone_plan.VIRAL_REGIONS, 500)) == 100
    assert clone_plan.virality_total({}) == 0


def test_model_covers_the_six_areas():
    assert set(clone_plan.VIRAL_REGIONS) <= set(clone_plan._Virality.model_fields)
    assert "never add claims" in clone_plan.VIRALITY_SYSTEM
