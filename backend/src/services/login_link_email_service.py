"""E-mails da entrada sem senha: o link para entrar e o aviso de assinatura inativa."""
from __future__ import annotations

from html import escape
from typing import Optional

from ..config import Config
from .email_service import EmailContent, SesEmailService, first_name_for

SUPPORT_WHATSAPP = "https://wa.me/5511913142143"
SUPPORT_WHATSAPP_LABEL = "(11) 91314-2143"
LINK_MINUTES = 15

_BUTTON = (
    'style="display:inline-block;padding:12px 22px;border-radius:6px;background:#7B3FE4;'
    'color:#ffffff;text-decoration:none;font-weight:600"'
)


class LoginLinkEmailService:
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self.email_service = SesEmailService(self.config)

    @property
    def is_configured(self) -> bool:
        return self.email_service.is_configured

    async def send_link(self, email: str, name: Optional[str], url: str) -> dict:
        return await self.email_service.send_email(email, self.build_link_email(name, url))

    async def send_inactive(self, email: str, name: Optional[str]) -> dict:
        return await self.email_service.send_email(email, self.build_inactive_email(name))

    def build_link_email(self, name: Optional[str], url: str) -> EmailContent:
        first_name = first_name_for(first_name=None, full_name=name, default="")
        hello = f"Olá, {first_name}!" if first_name else "Olá!"
        safe_url = escape(url, quote=True)
        return EmailContent(
            subject="Seu link para entrar no ClipGringa",
            html=(
                f"<p>{escape(hello)}</p>"
                "<p>Clique no botão abaixo para entrar no ClipGringa. Não precisa de senha.</p>"
                f'<p><a href="{safe_url}" {_BUTTON}>Entrar no ClipGringa</a></p>'
                f"<p>O link vale por {LINK_MINUTES} minutos e só pode ser usado uma vez. "
                "Se você não pediu este link, é só ignorar este e-mail.</p>"
                f'<p>Dúvida ou sugestão de melhoria? <a href="{SUPPORT_WHATSAPP}">Fale com a gente no WhatsApp {SUPPORT_WHATSAPP_LABEL}</a>.</p>'
                "<p>Equipe ClipGringa</p>"
            ),
            text=(
                f"{hello}\n\n"
                "Abra o link abaixo para entrar no ClipGringa. Não precisa de senha.\n\n"
                f"{url}\n\n"
                f"O link vale por {LINK_MINUTES} minutos e só pode ser usado uma vez. "
                "Se você não pediu este link, é só ignorar este e-mail.\n\n"
                f"Dúvida ou sugestão de melhoria? WhatsApp {SUPPORT_WHATSAPP_LABEL}: {SUPPORT_WHATSAPP}\n\n"
                "Equipe ClipGringa"
            ),
        )

    def build_inactive_email(self, name: Optional[str]) -> EmailContent:
        first_name = first_name_for(first_name=None, full_name=name, default="")
        hello = f"Olá, {first_name}." if first_name else "Olá."
        return EmailContent(
            subject="Seu acesso ao ClipGringa está pausado",
            html=(
                f"<p>{escape(hello)}</p>"
                "<p>O ClipGringa é um bônus para quem está com a assinatura da Gringatools ativa, "
                "e não encontramos uma assinatura ativa neste e-mail. Por isso o link de entrada não foi enviado.</p>"
                "<p>Quando a assinatura voltar a ficar ativa, é só pedir o link de novo na tela de entrada.</p>"
                f'<p>Acha que é engano? <a href="{SUPPORT_WHATSAPP}">Fale com o suporte no WhatsApp {SUPPORT_WHATSAPP_LABEL}</a>.</p>'
                "<p>Equipe ClipGringa</p>"
            ),
            text=(
                f"{hello}\n\n"
                "O ClipGringa é um bônus para quem está com a assinatura da Gringatools ativa, "
                "e não encontramos uma assinatura ativa neste e-mail. Por isso o link de entrada não foi enviado.\n\n"
                "Quando a assinatura voltar a ficar ativa, é só pedir o link de novo na tela de entrada.\n\n"
                f"Acha que é engano? Suporte no WhatsApp {SUPPORT_WHATSAPP_LABEL}: {SUPPORT_WHATSAPP}\n\n"
                "Equipe ClipGringa"
            ),
        )
