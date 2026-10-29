from src.ai_errors import ai_fail, is_no_credit_error, provider_of


def test_classifies_provider_failures():
    no_credit = Exception("ModelHTTPError status_code: 429, model_name: gpt-5-mini, body: You have no credits remaining. billing")
    assert provider_of(no_credit) == "openai"
    assert is_no_credit_error(no_credit)
    assert ai_fail(no_credit, "x").detail == "AI_NO_CREDITS:openai"
    assert ai_fail(Exception("429 RESOURCE_EXHAUSTED quota gemini"), "x").detail == "AI_QUOTA"
    assert ai_fail(Exception("something else"), "fallback").detail == "fallback"
