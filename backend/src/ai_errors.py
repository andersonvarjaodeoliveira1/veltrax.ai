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


def ai_fail(exc: Exception | None, fallback: str) -> HTTPException:
    """Diz de quem é a falha: sem créditos na chave, chave recusada, limite de uso da API ou erro genérico."""
    if exc is not None and is_no_credit_error(exc):
        return HTTPException(status_code=502, detail=f"AI_NO_CREDITS:{provider_of(exc)}")
    if exc is not None and is_key_error(exc):
        return HTTPException(status_code=502, detail=f"AI_KEY_INVALID:{provider_of(exc)}")
    if exc is not None and is_quota_error(exc):
        return HTTPException(status_code=503, detail="AI_QUOTA")
    return HTTPException(status_code=502, detail=fallback)
