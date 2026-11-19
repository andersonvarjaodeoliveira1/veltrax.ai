from types import SimpleNamespace

from src.services.signup_request_email_service import SignupRequestEmailService, format_phone, mask_cpf

SIGNUP = {"name": "Maria Souza", "email": "maria@example.com", "cpf": "52998224725", "phone": "11913142143"}


def service() -> SignupRequestEmailService:
    return SignupRequestEmailService(SimpleNamespace(
        app_base_url="https://app.test", aws_region=None, aws_access_key_id=None, aws_secret_access_key=None, ses_from_email=None,
    ))


def test_cpf_is_masked_and_phone_formatted():
    assert mask_cpf("52998224725") == "***.982.247-**"
    assert mask_cpf("123") == "***"
    assert format_phone("11913142143") == "(11) 91314-2143"
    assert format_phone("1133334444") == "(11) 3333-4444"


def test_admin_email_brings_the_lead_without_the_full_cpf():
    mail = service().build_requested_email(SIGNUP)
    assert "Maria Souza" in mail.subject
    for body in (mail.html, mail.text):
        assert "maria@example.com" in body
        assert "(11) 91314-2143" in body
        assert "***.982.247-**" in body
        assert "52998224725" not in body
        assert "https://app.test/admin#cadastros" in body


def test_approved_email_points_to_sign_in_and_support():
    mail = service().build_approved_email(SIGNUP)
    assert "liberado" in mail.subject
    assert "Olá, Maria." in mail.text
    assert "https://app.test/sign-in" in mail.text
    assert "wa.me/5511913142143" in mail.html
