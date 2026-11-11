from src.api.routes import clone_plan


def test_method_route_is_registered():
    paths = {r.path for r in clone_plan.router.routes}
    assert "/multiplier/clone/method" in paths


def test_method_model_has_the_five_fields():
    assert set(clone_plan._Method.model_fields) == {"hook", "angle", "mechanism", "cta", "why_it_works"}
