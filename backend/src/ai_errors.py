"""Classifica falhas da IA (sem créditos, chave recusada, limite de uso) para o app avisar a causa certa."""
from __future__ import annotations

from fastapi import HTTPException


def is_quota_error(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return any(key in text for key in ("429", "resource_exhausted", "quota", "rate limit", "404", "not_found", "no longer available", "overloaded", "503"))


def provider_of(exc: Exception) -> str:
    text = f"{type(exc).__name__} {exc}".lower()
    for name, keys in (("openai", ("openai", "gpt-")), ("anthropic", ("anthropic", "claude")), ("gemini", ("gemini", "google", "generativelanguage"))):
        if any(key in text for key in keys):
            return name
    return ""


def is_no_credit_error(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return any(key in text for key in ("insufficient_quota", "no credits", "credit balance", "credit_balance", "billing", "exceeded your current quota"))


def is_key_error(exc: Exception) -> bool:
    import re

    text = f"{type(exc).__name__} {exc}".lower()
    return bool(re.search(r"status_code:\s*40[13]\b|unauthorized|forbidden|permission denied|invalid[_ ]api[_ ]key|incorrect api key|authentication", text))


def brief(exc: Exception, limit: int = 180) -> str:
    """Tipo do erro + começo da mensagem, sem nada que pareça chave ou token."""
    import re

    text = f"{type(exc).__name__}: {exc}".replace("\n", " ")
    text = re.sub(r"(sk-[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z_\-]{20,}|Bearer\s+\S+|[A-Za-z0-9_\-]{32,})", "[oculto]", text)
    return text[:limit]


def ai_fail(exc: Exception | None, fallback: str) -> HTTPException:
    """Diz de quem é a falha: sem créditos na chave, chave recusada, limite de uso da API ou erro genérico."""
    from .ai_relay import RelayError

    if isinstance(exc, RelayError):
        return HTTPException(status_code=502, detail=f"AI_ACCOUNT:{exc.site}:{exc.code}")
    if exc is not None and is_no_credit_error(exc):
        return HTTPException(status_code=502, detail=f"AI_NO_CREDITS:{provider_of(exc)}")
    if exc is not None and is_key_error(exc):
        return HTTPException(status_code=502, detail=f"AI_KEY_INVALID:{provider_of(exc)}")
    if exc is not None and is_quota_error(exc):
        return HTTPException(status_code=503, detail="AI_QUOTA")
    if exc is not None:
        # Falha que não é de conta/chave/limite: devolve o tipo e um resumo curto (sem chaves) para dar para identificar a causa.
        return HTTPException(status_code=502, detail=f"AI_ERROR:{provider_of(exc) or 'ia'}:{brief(exc)}|{fallback}")
    return HTTPException(status_code=502, detail=fallback)
