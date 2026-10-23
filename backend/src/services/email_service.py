from __future__ import annotations

import asyncio
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Optional

import boto3

from ..config import Config


@dataclass(frozen=True)
class EmailContent:
    subject: str
    html: str
    text: str


class SesEmailService:
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self.region = self.config.aws_region
        self.access_key_id = self.config.aws_access_key_id
        self.secret_access_key = self.config.aws_secret_access_key
        self.from_email = self.config.ses_from_email
        self.smtp_user = getattr(self.config, "smtp_user", None)
        self.smtp_password = getattr(self.config, "smtp_password", None)
        self.smtp_host = getattr(self.config, "smtp_host", None)
        self.smtp_port = getattr(self.config, "smtp_port", 465)
        self.smtp_from = getattr(self.config, "smtp_from", None)

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_user and self.smtp_password and self.smtp_host)

    @property
    def is_configured(self) -> bool:
        if self.smtp_configured:
            return True
        return bool(
            self.region
            and self.access_key_id
            and self.secret_access_key
            and self.from_email
        )

    def _send(self, recipient: str, content: EmailContent) -> dict:
        client = boto3.client(
            "sesv2",
            region_name=self.region,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
        )
        return client.send_email(
            FromEmailAddress=self.from_email,
            Destination={"ToAddresses": [recipient]},
            Content={
                "Simple": {
                    "Subject": {"Data": content.subject, "Charset": "UTF-8"},
                    "Body": {
                        "Html": {"Data": content.html, "Charset": "UTF-8"},
                        "Text": {"Data": content.text, "Charset": "UTF-8"},
                    },
                }
            },
        )

    def _send_smtp(self, recipient: str, content: EmailContent) -> dict:
        message = EmailMessage()
        message["Subject"] = content.subject
        message["From"] = self.smtp_from or self.smtp_user
        message["To"] = recipient
        message.set_content(content.text)
        message.add_alternative(content.html, subtype="html")
        context = ssl.create_default_context()
        port = int(self.smtp_port)
        if port == 465:
            server = smtplib.SMTP_SSL(self.smtp_host, port, timeout=25, context=context)
        else:
            server = smtplib.SMTP(self.smtp_host, port, timeout=25)
            server.starttls(context=context)
        with server:
            server.login(self.smtp_user, self.smtp_password)
            server.send_message(message)
        return {"provider": "smtp", "to": recipient}

    async def send_email(self, recipient: str, content: EmailContent) -> dict:
        if self.smtp_configured:
            return await asyncio.to_thread(self._send_smtp, recipient, content)
        if not self.is_configured:
            raise RuntimeError(
                "E-mail não configurado. Preencha o e-mail de envio e a senha no Admin "
                "(ou configure o Amazon SES: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY e SES_FROM_EMAIL)."
            )

        response = await asyncio.to_thread(self._send, recipient, content)
        return dict(response)


def first_name_for(
    *,
    first_name: Optional[str] = None,
    full_name: Optional[str] = None,
    default: str = "there",
) -> str:
    if first_name and first_name.strip():
        return first_name.strip()
    if full_name and full_name.strip():
        return full_name.strip().split()[0]
    return default
