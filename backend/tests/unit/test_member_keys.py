"""API própria obrigatória: quem paga a transcrição e a análise, e a transcrição com a chave do membro."""
import base64
import hashlib
import hmac
import json
import time
import uuid
from pathlib import Path

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from src import member_keys
from src.database import get_db
from src.media import member_transcription as mt
from src.media import transcription
from src.runtime_settings import encrypt_setting_value


@pytest.fixture(autouse=True)
def rule_on(monkeypatch):
    monkeypatch.setenv("MEMBER_KEY_REQUIRED", "true")
    member_keys.set_plan(member_keys.HOUSE)
    yield
    member_keys.set_plan(member_keys.HOUSE)


# --- Plano da conta ----------------------------------------------------------------------------------------------------

def test_plano_por_tipo_de_conta():
    assert member_keys.plan_from(True, {}, house_allowed=False).mode == "house"           # administrador
    assert member_keys.plan_from(False, {"gemini": " g "}, house_allowed=True) == member_keys.KeyPlan("own", gemini="g")
    assert member_keys.plan_from(False, {"openai": "o"}, house_allowed=False).providers == ["openai"]
    assert member_keys.plan_from(False, {}, house_allowed=True).mode == "house"            # tokens liberados pelo administrador
    assert member_keys.plan_from(False, {"anthropic": "a"}, house_allowed=False).mode == "missing"


@pytest.fixture()
async def accounts(db_session):
    made: list[str] = []

    async def add(*, admin=False, keys=None, granted=None):
        user_id = str(uuid.uuid4())
        await db_session.execute(text('INSERT INTO users (id, name, email, is_admin, "emailVerified") VALUES (:i, \'Pessoa\', :e, :a, TRUE)'),
                                 {"i": user_id, "e": f"mk-{user_id[:8]}@clipgringa.test", "a": admin})
        for provider, value in (keys or {}).items():
            await db_session.execute(text("INSERT INTO user_integrations (user_id, provider, encrypted_value, hint) VALUES (:u, :p, :v, '')"),
                                     {"u": user_id, "p": provider, "v": encrypt_setting_value(value)})
        if granted is not None:
            await db_session.execute(text("INSERT INTO user_token_quota (user_id, granted) VALUES (:u, :g)"), {"u": user_id, "g": granted})
        await db_session.commit()
        made.append(user_id)
        return user_id

    db_session.add = add  # type: ignore[method-assign]
    try:
        yield db_session
    finally:
        await db_session.rollback()
        await db_session.execute(text("DELETE FROM users WHERE email LIKE 'mk-%@clipgringa.test'"))
        await db_session.commit()


async def test_resolve_no_banco(accounts, monkeypatch):
    admin = await accounts.add(admin=True)
    com_chave = await accounts.add(keys={"gemini": "chave-gemini", "anthropic": "outra"})
    sem_nada = await accounts.add()
    com_tokens = await accounts.add(granted=50_000)

    assert (await member_keys.resolve(accounts, admin)).mode == "house"
    assert await member_keys.resolve(accounts, com_chave) == member_keys.KeyPlan("own", gemini="chave-gemini")
    assert (await member_keys.resolve(accounts, sem_nada)).mode == "missing"
    assert (await member_keys.resolve(accounts, com_tokens)).mode == "house"
    assert (await member_keys.resolve(accounts, None)).mode == "house"

    with pytest.raises(member_keys.MemberKeyRequired, match="Minhas APIs"):
        await member_keys.activate(accounts, sem_nada)
    assert (await member_keys.activate(accounts, com_chave)).mode == "own" and member_keys.current_plan().gemini == "chave-gemini"

    monkeypatch.setenv("MEMBER_KEY_REQUIRED", "false")
    assert (await member_keys.resolve(accounts, sem_nada)).mode == "house"


async def test_criar_tarefa_sem_chave_e_recusado_com_a_orientacao(app, accounts):
    user_id = await accounts.add()
    stamp = str(int(time.time()))
    signature = hmac.new(b"test-backend-auth-secret", f"{user_id}:{stamp}".encode(), hashlib.sha256).hexdigest()

    async def same_session():
        yield accounts

    app.dependency_overrides[get_db] = same_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as http:
            response = await http.post("/tasks/", json={"source": {"url": "https://www.youtube.com/watch?v=abc"}},
                                       headers={"x-clipgringa-user-id": user_id, "x-clipgringa-ts": stamp, "x-clipgringa-signature": signature})
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 403
    assert "Conecte a sua chave do Gemini ou do ChatGPT em Minhas APIs" in response.json()["detail"]


# --- Transcrição com a chave do membro ---------------------------------------------------------------------------------

@pytest.fixture()
def audio(tmp_path, monkeypatch):
    path = tmp_path / "audio.mp3"
    path.write_bytes(b"ID3" + b"\x00" * 64)
    monkeypatch.setattr(mt, "split_audio", lambda audio_path, chunk, workdir: [(audio_path, 0.0)])
    monkeypatch.setattr(mt, "ffprobe_duration", lambda p: 60.0)
    return path


def openai_ok(words):
    return httpx.Response(200, json={"language": "portuguese", "text": " ".join(w[0] for w in words),
                                     "words": [{"word": w, "start": s, "end": e} for w, s, e in words]})


def gemini_ok(phrases):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(phrases)}]}}]})


def test_openai_devolve_tempo_por_palavra_e_frases(audio, tmp_path):
    seen = {}

    def post(url, **kwargs):
        seen.update(url=url, auth=kwargs["headers"]["Authorization"], data=kwargs["data"])
        return openai_ok([("Olha", 0.0, 0.3), ("isso.", 0.3, 0.8), ("Funciona", 2.5, 3.0), ("mesmo", 3.0, 3.4)])

    result = mt.transcribe_openai("sk-membro", audio, "pt_br", tmp_path, post)

    assert seen["url"] == mt.OPENAI_URL and seen["auth"] == "Bearer sk-membro"
    assert ("timestamp_granularities[]", "word") in seen["data"] and ("language", "pt") in seen["data"] and ("model", "whisper-1") in seen["data"]
    assert [s["text"] for s in result["segments"]] == ["Olha isso.", "Funciona mesmo"]
    first = result["segments"][0]["words"][0]
    # O pipeline só trata como segundos o que é float.
    assert first == {"word": "Olha", "start": 0.0, "end": 0.3, "probability": 1.0} and isinstance(first["start"], float)
    assert transcription.format_transcript_for_analysis(result)[1].startswith("[00:02 - 00:03] Funciona mesmo")


def test_audio_longo_soma_o_tempo_de_cada_pedaco(audio, tmp_path, monkeypatch):
    monkeypatch.setattr(mt, "split_audio", lambda audio_path, chunk, workdir: [(audio_path, 0.0), (audio_path, 1200.0)])
    result = mt.transcribe_openai("k", audio, None, tmp_path, lambda url, **kw: openai_ok([("Oi.", 1.0, 1.5)]))
    assert [s["start"] for s in result["segments"]] == [1.0, 1201.0]


def test_gemini_reparte_o_tempo_das_palavras_e_corrige_tempo_torto(audio, tmp_path):
    calls = []

    def post(url, **kwargs):
        calls.append(url)
        if "gemini-3.5-flash:" in url:
            return httpx.Response(429, json={"error": {"message": "quota exceeded for this model"}})
        body = kwargs["json"]
        assert kwargs["headers"]["x-goog-api-key"] == "chave-g"
        assert base64.b64decode(body["contents"][0]["parts"][1]["inline_data"]["data"]).startswith(b"ID3")
        assert body["generationConfig"]["responseMimeType"] == "application/json"
        return gemini_ok([{"start": 1.0, "end": 3.0, "text": "Olha só isso"}, {"start": 2.0, "end": 500.0, "text": "funciona"}, {"start": 5, "end": 6, "text": " "}])

    result = mt.transcribe_gemini("chave-g", audio, None, tmp_path, post)

    assert len(calls) == 2 and "gemini-3.6-flash" in calls[1]  # primeiro modelo sem cota: tenta o seguinte
    one, two = result["segments"]
    assert [w["word"] for w in one["words"]] == ["Olha", "só", "isso"]
    assert one["words"][0]["start"] == 1.0 and one["words"][-1]["end"] == pytest.approx(3.0, abs=0.01)
    assert all(isinstance(w["start"], float) and w["end"] > w["start"] for w in one["words"])
    # Frase que começava antes do fim da anterior e terminava depois do fim do áudio (60 s) é encaixada.
    assert two["start"] == 3.0 and two["end"] == 60.0


@pytest.mark.parametrize("response,kind,texto", [
    (httpx.Response(400, json={"error": {"message": "API key not valid. Please pass a valid API key."}}), "key", "foi recusada"),
    (httpx.Response(403, json={"error": {"message": "forbidden"}}), "key", "Minhas APIs"),
])
def test_chave_do_gemini_recusada_avisa_o_membro(audio, tmp_path, response, kind, texto):
    with pytest.raises(mt.MemberTranscriptionError) as error:
        mt.transcribe_gemini("ruim", audio, None, tmp_path, lambda url, **kw: response)
    assert error.value.kind == kind and texto in str(error.value) and "Gemini" in str(error.value)


def test_com_as_duas_chaves_o_gemini_cobre_a_falha_da_openai(audio):
    def post(url, **kwargs):
        if url == mt.OPENAI_URL:
            return httpx.Response(429, json={"error": {"message": "You exceeded your current quota"}})
        return gemini_ok([{"start": 0.5, "end": 2.0, "text": "Deu certo"}])

    result = mt.transcribe_with_member_keys(audio, openai_key="o", gemini_key="g", post=post)
    assert result["segments"][0]["text"] == "Deu certo"

    with pytest.raises(mt.MemberTranscriptionError, match="cota da sua chave do ChatGPT"):
        mt.transcribe_with_member_keys(audio, openai_key="o", post=post)


def test_sem_fala_nao_vira_legenda_vazia(audio, tmp_path):
    with pytest.raises(mt.MemberTranscriptionError) as error:
        mt.transcribe_gemini("g", audio, None, tmp_path, lambda url, **kw: gemini_ok([]))
    assert error.value.kind == "empty"


def test_palavras_viram_frases_na_pausa_e_no_tamanho():
    words = [{"word": f"p{i}", "start": float(i), "end": float(i) + 0.5, "probability": 1.0} for i in range(30)]
    segments = mt.segments_from_words(words)
    assert len(segments) >= 2 and all(s["end"] - s["start"] <= mt.MAX_SEGMENT_SECONDS + 1 for s in segments)
    paused = mt.segments_from_words([{"word": "a", "start": 0.0, "end": 0.2}, {"word": "b", "start": 3.0, "end": 3.2}])
    assert [s["text"] for s in paused] == ["a", "b"]


# --- Pipeline ----------------------------------------------------------------------------------------------------------

def test_pipeline_usa_a_chave_do_membro_e_guarda_o_cache_das_legendas(tmp_path, monkeypatch):
    video = tmp_path / "video.mp4"
    video.write_bytes(b"0")
    used = {}

    def fake(audio_path, **kwargs):
        used.update(kwargs)
        return {"text": "Olha isso.", "language": "pt", "segments": [{"start": 0.0, "end": 0.8, "text": "Olha isso.", "words": [
            {"word": "Olha", "start": 0.0, "end": 0.3, "probability": 1.0}, {"word": "isso.", "start": 0.3, "end": 0.8, "probability": 1.0}]}]}

    monkeypatch.setattr(transcription, "_prepare_audio_for_transcription", lambda path: path)
    monkeypatch.setattr(mt, "transcribe_with_member_keys", fake)
    monkeypatch.setattr(transcription.aai, "Transcriber", lambda *a, **k: pytest.fail("não pode usar a transcrição do servidor"))

    member_keys.set_plan(member_keys.KeyPlan("own", gemini="g", openai="o"))
    text_out = transcription.get_video_transcript(video)

    assert used["gemini_key"] == "g" and used["openai_key"] == "o"
    assert text_out == "[00:00 - 00:00] Olha isso."
    cached = transcription.load_cached_transcript_data(video)
    assert [(w["text"], w["start"], w["end"]) for w in cached["words"]] == [("Olha", 0, 300), ("isso.", 300, 800)]

    member_keys.set_plan(member_keys.KeyPlan("missing"))
    with pytest.raises(member_keys.MemberKeyRequired):
        transcription.get_video_transcript(video)


async def test_analise_dos_cortes_roda_no_modelo_do_membro(monkeypatch):
    from src import ai

    class Agent:
        def __init__(self):
            self.calls = []

        async def run(self, prompt, **kwargs):
            self.calls.append(kwargs.get("model"))
            if kwargs.get("model") == "modelo-1":
                raise RuntimeError("sem cota neste modelo")
            return "ok"

    monkeypatch.setattr(member_keys, "text_models", lambda plan=None: ["modelo-1", "modelo-2"])

    member_keys.set_plan(member_keys.KeyPlan("own", gemini="g"))
    agent = Agent()
    assert await ai._run_agent_for_account(agent, "prompt") == "ok" and agent.calls == ["modelo-1", "modelo-2"]

    member_keys.set_plan(member_keys.HOUSE)
    agent = Agent()
    assert await ai._run_agent_for_account(agent, "prompt") == "ok" and agent.calls == [None]  # modelo do servidor

    member_keys.set_plan(member_keys.KeyPlan("missing"))
    with pytest.raises(member_keys.MemberKeyRequired):
        await ai._run_agent_for_account(Agent(), "prompt")


def test_modelos_de_texto_do_membro():
    models = member_keys.text_models(member_keys.KeyPlan("own", gemini="g", openai="o"))
    assert [m.model_name for m in models] == [*member_keys.GEMINI_TEXT_MODELS, member_keys.OPENAI_TEXT_MODEL]
    assert member_keys.text_models(member_keys.HOUSE) == []
