"""E-mails da captura do cadastro: aviso ao administrador e liberação para a pessoa."""
from __future__ import annotations

from html import escape
from typing import Any, Optional

from ..config import Config
from .email_service import EmailContent, SesEmailService, first_name_for

SUPPORT_WHATSAPP = "https://wa.me/5511913142143"


def mask_cpf(cpf: str) -> str:
    """No e-mail vai só o miolo do CPF; o número inteiro fica no Admin."""
    digits = "".join(ch for ch in str(cpf or "") if ch.isdigit())
    return f"***.{digits[3:6]}.{digits[6:9]}-**" if len(digits) == 11 else "***"


def format_phone(phone: str) -> str:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    return digits


class SignupRequestEmailService:
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self.email_service = SesEmailService(self.config)
        self.app_url = getattr(self.config, "app_base_url", "http://localhost:3107")

    async def send_requested_email(self, admin_email: str, request: dict[str, Any]) -> dict:
        return await self.email_service.send_email(admin_email, self.build_requested_email(request))

    async def send_approved_email(self, request: dict[str, Any]) -> dict:
        return await self.email_service.send_email(str(request["email"]), self.build_approved_email(request))

    def build_requested_email(self, request: dict[str, Any]) -> EmailContent:
        rows = [
            ("Nome", str(request.get("name") or "")),
            ("E-mail", str(request.get("email") or "")),
            ("Telefone", format_phone(str(request.get("phone") or ""))),
            ("CPF", mask_cpf(str(request.get("cpf") or ""))),
        ]
        review_url = f"{self.app_url}/admin#cadastros"
        return EmailContent(
            subject=f"Novo cadastro aguardando liberação: {rows[0][1]}",
            html=(
                "<p>Uma pessoa criou a conta no ClipGringa e está aguardando a sua liberação.</p><p>"
                + "<br>".join(f"<strong>{escape(label)}:</strong> {escape(value)}" for label, value in rows)
                + "</p><p>O CPF completo fica no Admin.</p>"
                f'<p><a href="{escape(review_url)}">Abrir os cadastros no Admin</a></p>'
            ),
            text=(
                "Uma pessoa criou a conta no ClipGringa e está aguardando a sua liberação.\n\n"
                + "\n".join(f"{label}: {value}" for label, value in rows)
                + f"\n\nO CPF completo fica no Admin.\nAbrir: {review_url}\n"
            ),
        )

    def build_approved_email(self, request: dict[str, Any]) -> EmailContent:
        first_name = first_name_for(first_name=None, full_name=str(request.get("name") or ""))
        link = f"{self.app_url}/sign-in"
        return EmailContent(
            subject="Seu acesso ao ClipGringa foi liberado",
            html=(
                f"<p>Olá, {escape(first_name)}.</p>"
                "<p>O seu acesso ao ClipGringa foi liberado. Entre com o e-mail e a senha que você criou no cadastro.</p>"
                f'<p><a href="{escape(link)}">Entrar no ClipGringa</a></p>'
                f'<p>Precisa de ajuda? <a href="{SUPPORT_WHATSAPP}">Fale com o suporte no WhatsApp</a>.</p>'
            ),
            text=(
                f"Olá, {first_name}.\n\nO seu acesso ao ClipGringa foi liberado. "
                "Entre com o e-mail e a senha que você criou no cadastro.\n\n"
                f"Entrar: {link}\n\nPrecisa de ajuda? Suporte no WhatsApp: {SUPPORT_WHATSAPP}\n"
            ),
        )
