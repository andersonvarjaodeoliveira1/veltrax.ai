"""Autoteste da chave própria: confere o resultado e nunca derruba o servidor."""
import json
from types import SimpleNamespace

import httpx
import pytest

from src.media import member_transcription as mt
from src.media import transcription_selftest as st

WORDS = [("Hello.", 0.2, 0.6), ("This", 0.9, 1.1), ("is", 1.1, 1.2), ("a", 1.2, 1.3), ("short", 1.3, 1.6), ("transcription", 1.6, 2.3), ("test", 2.3, 2.7)]


def test_o_audio_de_exemplo_acompanha_o_codigo():
    assert st.SAMPLE.exists() and 5_000 < st.SAMPLE.stat().st_size < 200_000


def test_transcricao_com_openai_passa_quando_o_texto_e_os_tempos_batem():
    ok = httpx.Response(200, json={"language": "english", "words": [{"word": w, "start": s, "end": e} for w, s, e in WORDS]})
    assert st.run_transcription("openai", "chave", lambda url, **kw: ok).startswith("2 frases, 7 palavras")


def test_transcricao_com_gemini_passa_e_texto_errado_e_falha():
    good = httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps([{"start": 0.2, "end": 2.7, "text": "Hello. This is a short transcription test"}])}]}}]})
    assert "7 palavras" in st.run_transcription("gemini", "chave", lambda url, **kw: good)
    wrong = httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps([{"start": 0.2, "end": 2.7, "text": "música ao fundo sem fala alguma aqui"}])}]}}]})
    with pytest.raises(RuntimeError, match="texto inesperado"):
        st.run_transcription("gemini", "chave", lambda url, **kw: wrong)


async def test_relatorio_sem_chave_com_falha_e_com_sucesso(monkeypatch, caplog):
    monkeypatch.setattr(st, "get_config", lambda: SimpleNamespace(google_api_key="g", openai_api_key=""))

    def fake(provider, key, post=None):
        raise mt.MemberTranscriptionError("gemini", "quota")

    async def analysis(gemini_key, openai_key):
        return "4 trechos"

    monkeypatch.setattr(st, "run_transcription", fake)
    monkeypatch.setattr(st, "run_analysis", analysis)
    with caplog.at_level("INFO"):
        report = await st.run_selftest()
    assert report == {"transcricao_gemini": "falhou: quota", "transcricao_openai": "sem chave do servidor para testar", "analise": "ok: 4 trechos"}
    assert "FALHOU" in caplog.text and "chave-secreta" not in caplog.text

    monkeypatch.setattr(st, "get_config", lambda: SimpleNamespace(google_api_key="", openai_api_key=""))
    assert await st.run_selftest() == {"transcricao_gemini": "sem chave do servidor para testar", "transcricao_openai": "sem chave do servidor para testar"}


def test_texto_de_exemplo_tem_o_formato_do_pipeline():
    lines = st.FAKE_TRANSCRIPT.splitlines()
    assert len(lines) == 16 and lines[0].startswith("[00:00 - 00:06] ") and lines[-1].startswith("[01:30 - 01:36] ")
