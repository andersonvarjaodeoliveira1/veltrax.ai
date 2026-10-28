from src.api.routes import clone_plan


def test_person_look_route_is_registered():
    paths = {route.path for route in clone_plan.router.routes}
    assert any(path.endswith("/person-look") for path in paths)


def test_person_look_prompt_never_identifies_people():
    text = clone_plan.PERSON_LOOK_SYSTEM.lower()
    assert "never say who the person is" in text
    assert "adult" in text


def test_person_schema_fields():
    out = clone_plan._Person(age="28", look="long black hair")
    assert out.age == "28" and out.look.startswith("long")
