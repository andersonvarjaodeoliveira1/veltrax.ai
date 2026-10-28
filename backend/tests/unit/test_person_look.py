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


def test_ai_fail_tells_no_credits_from_invalid_key():
    from src.api.routes.clone_plan import _ai_fail

    no_credit = Exception("status_code: 429, model_name: gpt-5-mini, body: {'message': 'You have no credits remaining.', 'type': 'insufficient_quota'}")
    assert _ai_fail(no_credit, "x").detail == "AI_NO_CREDITS:openai"
    bad_key = Exception("status_code: 401, model_name: claude-sonnet-5-5, body: invalid x-api-key authentication_error anthropic")
    assert _ai_fail(bad_key, "x").detail == "AI_KEY_INVALID:anthropic"
    assert _ai_fail(Exception("boom 1403ms"), "fallback").detail == "fallback"
