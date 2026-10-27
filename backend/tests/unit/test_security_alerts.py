import asyncio

import src.security_alerts as sa


def test_buffer_dedupes_same_user_and_kind():
    b = sa.AlertBuffer()
    assert b.add("contextmenu", "a@x.com", "/", dedupe_seconds=600, now=0) is True
    assert b.add("contextmenu", "a@x.com", "/", dedupe_seconds=600, now=10) is False
    assert b.add("contextmenu", "b@x.com", "/", dedupe_seconds=600, now=10) is True
    assert b.add("contextmenu", "a@x.com", "/", dedupe_seconds=600, now=700) is True
    assert len(b.drain()) == 3 and b.drain() == []


def test_email_lists_events_and_escapes_html():
    b = sa.AlertBuffer()
    b.add("paste_code", "<b>x</b>@mail.com", "/automacao 500 caracteres")
    mail = sa.build_email(b.drain())
    assert "1 sinal" in mail.subject
    assert "<b>x</b>" not in mail.html and "&lt;b&gt;" in mail.html
    assert "colou um trecho parecido com código" in mail.text


def test_recipients_default_and_override(monkeypatch):
    monkeypatch.delenv("SECURITY_ALERT_EMAILS", raising=False)
    assert "gringatools@gmail.com" in sa.recipients()
    monkeypatch.setenv("SECURITY_ALERT_EMAILS", "um@x.com, dois@x.com")
    assert sa.recipients() == ["um@x.com", "dois@x.com"]


def test_flush_sends_to_every_recipient(monkeypatch):
    sent = []

    class Fake:
        is_configured = True

        def __init__(self, *_):
            pass

        async def send_email(self, to, content):
            sent.append(to)

    monkeypatch.setattr(sa, "SesEmailService", Fake)
    monkeypatch.setattr(sa, "get_config", lambda: None)
    monkeypatch.delenv("SECURITY_ALERT_EMAILS", raising=False)
    sa.buffer.add("scanner", "1.2.3.4", "GET /")
    assert asyncio.run(sa.flush_once()) == 2
    assert sorted(sent) == sorted(sa.DEFAULT_ALERT_EMAILS)
    assert asyncio.run(sa.flush_once()) == 0  # nada novo, nada enviado
