from src.ai_errors import ai_fail


def test_ai_fail_names_the_account_that_failed():
    err = ai_fail(ValueError("Exceeded maximum retries (2) for output validation"), "x", "account:gemini")
    assert err.detail.startswith("AI_ERROR:conta-gemini:")


def test_ai_fail_names_the_api_key_provider():
    err = ai_fail(ValueError("Exceeded maximum retries (2) for output validation"), "x", "api:chatgpt")
    assert err.detail.startswith("AI_ERROR:openai:")
