"""Autoteste da transcrição e da análise com chave própria, contra as APIs de verdade.

Os membros usam a própria chave do Gemini ou do ChatGPT (member_transcription.py, member_keys.py). Os testes
automáticos usam respostas simuladas, então este autoteste roda uma vez quando o servidor sobe, com a chave do
próprio servidor (quando existe), num áudio de 6 segundos que acompanha o código, e escreve o resultado no
registro. Serve para descobrir antes dos membros se um modelo saiu do ar ou se o formato da API mudou.
Nunca derruba o servidor e nunca mostra a chave.
"""
from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path
from typing import Any

from ..config import get_config
from . import member_transcription as mt

logger = logging.getLogger(__name__)

SAMPLE = Path(__file__).with_name("selftest.mp3")
EXPECTED_WORDS = ("transcription", "test")
STARTUP_DELAY_SECONDS = 25
FAKE_TRANSCRIPT = "\n".join(
    f"[{i // 60:02d}:{i % 60:02d} - {(i + 6) // 60:02d}:{(i + 6) % 60:02d}] " + text
    for i, text in zip(range(0, 96, 6), [
        "Eu perdi tudo o que tinha em seis meses e ninguém percebeu.", "A empresa faturava bem, mas eu olhava o número errado.",
        "Todo mundo olha o faturamento. Quase ninguém olha o caixa.", "No dia em que o caixa zerou, eu tinha três funcionários para pagar.",
        "Foi aí que eu aprendi a regra que mudou o meu negócio.", "Primeiro você separa o imposto. Depois o seu salário. Só depois o resto.",
        "Parece simples, mas noventa por cento dos donos de negócio fazem ao contrário.", "Eles pagam tudo e ficam com o que sobra. E nunca sobra.",
        "Quando eu inverti a ordem, em três meses eu tinha reserva.", "Em um ano, eu tinha doze meses de caixa guardados.",
        "A regra é: o lucro sai primeiro, não por último.", "Se você tem um negócio, faz esse teste na segunda-feira.",
        "Abre uma conta separada e transfere dez por cento de tudo que entrar.", "Você vai ver que a empresa se ajusta ao que sobra.",
        "E pela primeira vez você vai saber quanto o negócio dá de verdade.", "Me conta nos comentários se você já faz isso.",
    ])
)


def _check(result: dict[str, Any]) -> str:
    text = str(result.get("text", "")).lower()
    words = sum(len(segment.get("words") or []) for segment in result.get("segments", []))
    timed = all(isinstance(w.get("start"), float) and w["end"] > w["start"] for s in result.get("segments", []) for w in s.get("words") or [])
    if not all(word in text for word in EXPECTED_WORDS):
        raise RuntimeError(f"texto inesperado: {text[:80]!r}")
    if words < 5 or not timed:
        raise RuntimeError(f"tempos das palavras inválidos ({words} palavras)")
    last = max((float(s["end"]) for s in result["segments"]), default=0.0)
    return f"{len(result['segments'])} frases, {words} palavras, até {last:.1f}s"


def run_transcription(provider: str, key: str, post: mt.Post = mt._post) -> str:
    """Transcreve o áudio de exemplo com o provedor pedido. Devolve um resumo ou levanta o erro."""
    run = mt.transcribe_gemini if provider == "gemini" else mt.transcribe_openai
    with tempfile.TemporaryDirectory(prefix="autoteste-") as workdir:
        return _check(run(key, SAMPLE, "en", Path(workdir), post))


async def run_analysis(gemini_key: str, openai_key: str) -> str:
    """Roda a escolha dos cortes, num texto de exemplo, com os modelos de texto que a chave do membro usaria."""
    from .. import ai, member_keys

    previous = member_keys.current_plan()
    member_keys.set_plan(member_keys.KeyPlan("own", gemini=gemini_key, openai=openai_key))
    try:
        result = await asyncio.wait_for(ai._run_agent_for_account(ai.get_transcript_agent(), FAKE_TRANSCRIPT), timeout=120)
    finally:
        member_keys.set_plan(previous)
    output = getattr(result, "output", None)
    segments = getattr(output, "most_relevant_segments", None)
    return f"{len(segments)} trechos" if segments is not None else "respondeu"


async def run_selftest() -> dict[str, str]:
    """Roda o que der com as chaves do servidor e devolve {teste: resultado}. Cada falha vira um aviso no registro."""
    config = get_config()
    keys = {"gemini": (config.google_api_key or "").strip(), "openai": (config.openai_api_key or "").strip()}
    report: dict[str, str] = {}
    if not SAMPLE.exists():
        logger.warning("autoteste da chave própria: áudio de exemplo ausente")
        return report
    for provider, key in keys.items():
        label = mt.PROVIDER_LABEL[provider]
        if not key:
            report[f"transcricao_{provider}"] = "sem chave do servidor para testar"
            logger.info("autoteste da chave própria: transcrição com %s não testada (o servidor não tem essa chave)", label)
            continue
        try:
            summary = await asyncio.wait_for(asyncio.to_thread(run_transcription, provider, key), timeout=180)
            report[f"transcricao_{provider}"] = f"ok: {summary}"
            logger.info("autoteste da chave própria: transcrição com %s OK (%s)", label, summary)
        except Exception as exc:  # noqa: BLE001 - o autoteste nunca derruba o servidor
            kind = getattr(exc, "kind", type(exc).__name__)
            report[f"transcricao_{provider}"] = f"falhou: {kind}"
            logger.warning("autoteste da chave própria: transcrição com %s FALHOU (%s: %s)", label, kind, str(exc)[:200])
    if keys["gemini"] or keys["openai"]:
        try:
            summary = await run_analysis(keys["gemini"], keys["openai"])
            report["analise"] = f"ok: {summary}"
            logger.info("autoteste da chave própria: escolha dos cortes OK (%s)", summary)
        except Exception as exc:  # noqa: BLE001
            report["analise"] = f"falhou: {type(exc).__name__}"
            logger.warning("autoteste da chave própria: escolha dos cortes FALHOU (%s: %s)", type(exc).__name__, str(exc)[:200])
    return report


async def run_after_startup() -> None:
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    try:
        await run_selftest()
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.warning("autoteste da chave própria não rodou", exc_info=True)
