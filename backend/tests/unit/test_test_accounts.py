from types import SimpleNamespace

from src.services.password_reset_email_service import PasswordResetEmailService


def service() -> PasswordResetEmailService:
    config = SimpleNamespace(aws_region="r", aws_access_key_id="a", aws_secret_access_key="s", ses_from_email="x <x@example.com>")
    return PasswordResetEmailService(config)


def test_test_invite_says_it_is_a_test_account_for_the_days_and_forbids_copying():
    user = SimpleNamespace(email="a@example.com", first_name="Alison", name=None)
    content = service()._build_invite_email(user, "https://app.example.com/reset-password/tok", 7)
    assert "7 dias" in content.subject
    assert "conta de teste" in content.text
    assert "https://app.example.com/reset-password/tok" in content.text
    assert "Minhas APIs" in content.text
    assert "engenharia reversa" in content.text


def test_regular_invite_is_unchanged_without_test_days():
    user = SimpleNamespace(email="a@example.com", first_name="Ada", name=None)
    content = service()._build_invite_email(user, "https://app.example.com/x")
    assert content.subject == "Seu acesso ao ClipGringa está liberado"
    assert "conta de teste" not in content.text
