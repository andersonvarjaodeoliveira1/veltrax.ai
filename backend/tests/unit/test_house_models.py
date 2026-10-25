from src import integrations


def test_house_models_put_claude_first_and_skip_the_users_own_keys():
    integrations._house_keys.set({"anthropic": "sk-ant-house", "gemini": "g-house"})
    integrations._current_keys.set({"gemini": "g-house"})
    names = [type(m).__name__ for m in integrations.house_models()]
    assert names == ["AnthropicModel"]  # a chave Gemini igual à do usuário não se repete
    integrations._current_keys.set({})
    names = [type(m).__name__ for m in integrations.house_models()]
    assert names == ["AnthropicModel", "GoogleModel"]
