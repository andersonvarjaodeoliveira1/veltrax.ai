"""Transcrição com a chave do próprio membro (ChatGPT/OpenAI ou Gemini).

Devolve o mesmo formato do Whisper local ({"text", "language", "segments": [{"start", "end", "text", "words"}]},
tempos em segundos), que o resto do pipeline já entende (format_transcript_for_analysis, cache_transcript_data).

- OpenAI: `whisper-1` com tempo por palavra (é o único modelo da OpenAI que devolve tempos; a OpenAI anunciou
  o desligamento dele para 26/02/2027, então o Gemini é o caminho que fica).
- Gemini: transcreve por frase, com início e fim; o tempo de cada palavra é repartido dentro da frase pelo
  tamanho da palavra. A legenda fica um pouco menos cravada que com tempo por palavra.

Áudios longos são cortados em pedaços (limite de 25 MB da OpenAI e de 20 MB por pedido do Gemini; pedaços
curtos também mantêm os tempos do Gemini certos) e os tempos são somados de volta.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable, Optional

import httpx

from .ffmpeg import ffprobe_duration, run_ffmpeg_command

logger = logging.getLogger(__name__)

OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions"
OPENAI_MODEL = "whisper-1"
OPENAI_CHUNK_SECONDS = 20 * 60  # ~10 MB em mp3 mono 64 kbps; o limite é 25 MB
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_MODELS = ("gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite")
GEMINI_CHUNK_SECONDS = 8 * 60  # ~4 MB por pedido; pedaço curto mantém os tempos certos
MAX_SEGMENT_SECONDS = 12.0
PROVIDER_LABEL = {"openai": "ChatGPT (OpenAI)", "gemini": "Gemini"}

Post = Callable[..., httpx.Response]


class MemberTranscriptionError(RuntimeError):
    """Falha da chave do membro, já com a mensagem que ele vai ler."""

    def __init__(self, provider: str, kind: str, detail: str = "") -> None:
        self.provider, self.kind = provider, kind
        label = PROVIDER_LABEL.get(provider, provider)
        messages = {
            "key": f"A sua chave do {label} foi recusada na transcrição. Confira a chave em Minhas APIs.",
            "quota": f"A cota da sua chave do {label} acabou ou a conta está sem crédito. Confira no painel do {label} ou conecte outra chave em Minhas APIs.",
            "busy": f"O {label} não respondeu à transcrição agora. Tente de novo em alguns minutos.",
            "empty": "A transcrição voltou vazia. Confira se o vídeo tem fala e tente de novo.",
        }
        super().__init__(messages.get(kind) or f"Transcription failed with the member's {label} key: {detail}"[:300])


def _post(url: str, **kwargs: Any) -> httpx.Response:
    with httpx.Client(timeout=httpx.Timeout(600, connect=20)) as client:
        return client.post(url, **kwargs)


def _raise_for(provider: str, response: httpx.Response) -> None:
    if response.status_code < 400:
        return
    body = response.text[:400].lower()
    if response.status_code in (401, 403) or "api key not valid" in body or "invalid api key" in body or "api_key_invalid" in body:
        raise MemberTranscriptionError(provider, "key")
    if response.status_code in (402, 429) or "quota" in body or "billing" in body or "insufficient" in body:
        raise MemberTranscriptionError(provider, "quota")
    if response.status_code >= 500:
        raise MemberTranscriptionError(provider, "busy")
    raise MemberTranscriptionError(provider, "other", f"HTTP {response.status_code}")


# ---------------------------------------------------------------------------------------------------------------------
# Áudio em pedaços
# ---------------------------------------------------------------------------------------------------------------------
def split_audio(audio_path: Path, chunk_seconds: int, workdir: Path) -> list[tuple[Path, float]]:
    """Devolve [(arquivo, segundo em que ele começa)]. Áudio curto volta inteiro."""
    try:
        duration = float(ffprobe_duration(audio_path))
    except Exception:
        duration = 0.0
    if duration <= chunk_seconds + 30:
        return [(audio_path, 0.0)]
    pattern = workdir / "parte_%03d.mp3"
    result = run_ffmpeg_command(
        ["ffmpeg", "-y", "-i", str(audio_path), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k",
         "-f", "segment", "-segment_time", str(chunk_seconds), "-reset_timestamps", "1", str(pattern)],
        timeout=1800,
    )
    parts = sorted(workdir.glob("parte_*.mp3"))
    if result.returncode != 0 or not parts:
        logger.warning("não foi possível cortar o áudio em pedaços; enviando inteiro")
        return [(audio_path, 0.0)]
    return [(part, index * float(chunk_seconds)) for index, part in enumerate(parts)]


# ---------------------------------------------------------------------------------------------------------------------
# Montagem no formato do Whisper
# ---------------------------------------------------------------------------------------------------------------------
def _spread_words(text: str, start: float, end: float) -> list[dict[str, Any]]:
    """Reparte o tempo da frase entre as palavras, pelo tamanho de cada uma."""
    tokens = text.split()
    if not tokens:
        return []
    end = max(end, start + 0.05 * len(tokens))
    weights = [len(token) + 1 for token in tokens]
    total = float(sum(weights))
    words, cursor = [], start
    for token, weight in zip(tokens, weights):
        span = (end - start) * weight / total
        words.append({"word": token, "start": float(round(cursor, 3)), "end": float(round(cursor + span, 3)), "probability": 0.7})
        cursor += span
    return words


def segments_from_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa palavras com tempo em frases: fecha na pontuação final, numa pausa ou quando fica longa."""
    segments: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []

    def close() -> None:
        if current:
            segments.append({
                "start": float(current[0]["start"]), "end": float(current[-1]["end"]),
                "text": " ".join(str(w["word"]).strip() for w in current).strip(), "words": list(current),
            })
            current.clear()

    for word in words:
        if current and (float(word["start"]) - float(current[-1]["end"]) > 1.2 or float(word["end"]) - float(current[0]["start"]) > MAX_SEGMENT_SECONDS):
            close()
        current.append(word)
        if re.search(r"[.!?…]$", str(word["word"]).strip()):
            close()
    close()
    return segments


def _clean_words(raw: Any, offset: float) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in raw or []:
        token = str(item.get("word", "")).strip()
        if not token:
            continue
        try:
            start, end = float(item["start"]) + offset, float(item["end"]) + offset
        except (KeyError, TypeError, ValueError):
            continue
        out.append({"word": token, "start": float(round(start, 3)), "end": float(round(max(end, start + 0.02), 3)), "probability": 1.0})
    return out


# ---------------------------------------------------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------------------------------------------------
def transcribe_openai(key: str, audio_path: Path, language: Optional[str], workdir: Path, post: Post = _post) -> dict[str, Any]:
    words: list[dict[str, Any]] = []
    detected = None
    for part, offset in split_audio(audio_path, OPENAI_CHUNK_SECONDS, workdir):
        data: list[tuple[str, str]] = [("model", OPENAI_MODEL), ("response_format", "verbose_json"), ("timestamp_granularities[]", "word")]
        if language:
            data.append(("language", language.split("_", 1)[0]))
        with open(part, "rb") as handle:
            try:
                response = post(OPENAI_URL, headers={"Authorization": f"Bearer {key}"}, data=data, files={"file": (part.name, handle, "audio/mpeg")})
            except httpx.HTTPError as exc:
                raise MemberTranscriptionError("openai", "busy") from exc
        _raise_for("openai", response)
        payload = response.json()
        detected = detected or payload.get("language")
        words.extend(_clean_words(payload.get("words"), offset))
    if not words:
        raise MemberTranscriptionError("openai", "empty")
    segments = segments_from_words(words)
    return {"text": " ".join(s["text"] for s in segments), "language": detected, "segments": segments}


# ---------------------------------------------------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------------------------------------------------
GEMINI_PROMPT = (
    "Transcribe this audio verbatim, in the language that is spoken. Do not translate, summarize or add anything. "
    "Split the transcript into short phrases of at most 12 words each, following the natural pauses. "
    "For every phrase give the start and end time in seconds from the beginning of this audio file (decimals allowed). "
    "Skip music and silence. If nothing is spoken, return an empty list."
)
GEMINI_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {"start": {"type": "NUMBER"}, "end": {"type": "NUMBER"}, "text": {"type": "STRING"}},
        "required": ["start", "end", "text"],
    },
}


def _gemini_chunk(key: str, part: Path, language: Optional[str], post: Post) -> list[dict[str, Any]]:
    prompt = GEMINI_PROMPT + (f" The spoken language is expected to be '{language.split('_', 1)[0]}'." if language else "")
    body = {
        "contents": [{"parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(part.read_bytes()).decode()}},
        ]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": GEMINI_SCHEMA},
    }
    last: Exception | None = None
    for model in GEMINI_MODELS:
        try:
            response = post(GEMINI_URL.format(model=model), headers={"x-goog-api-key": key, "Content-Type": "application/json"}, json=body)
        except httpx.HTTPError as exc:
            last = MemberTranscriptionError("gemini", "busy")
            last.__cause__ = exc
            continue
        # Modelo fora do ar, sem cota nele ou desconhecido para esta chave: tenta o próximo. Chave recusada não.
        if response.status_code in (404, 429) or response.status_code >= 500:
            try:
                _raise_for("gemini", response)
            except MemberTranscriptionError as exc:
                last = exc
            else:
                last = MemberTranscriptionError("gemini", "busy")
            continue
        _raise_for("gemini", response)
        try:
            text_part = response.json()["candidates"][0]["content"]["parts"][0]["text"]
            phrases = json.loads(text_part)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            last = MemberTranscriptionError("gemini", "busy")
            last.__cause__ = exc
            continue
        return phrases if isinstance(phrases, list) else []
    raise last or MemberTranscriptionError("gemini", "busy")


def transcribe_gemini(key: str, audio_path: Path, language: Optional[str], workdir: Path, post: Post = _post) -> dict[str, Any]:
    segments: list[dict[str, Any]] = []
    for part, offset in split_audio(audio_path, GEMINI_CHUNK_SECONDS, workdir):
        try:
            limit = float(ffprobe_duration(part))
        except Exception:
            limit = float(GEMINI_CHUNK_SECONDS) + 30
        previous_end = 0.0
        for phrase in _gemini_chunk(key, part, language, post):
            text_value = str((phrase or {}).get("text", "")).strip() if isinstance(phrase, dict) else ""
            if not text_value:
                continue
            try:
                start, end = float(phrase["start"]), float(phrase["end"])
            except (KeyError, TypeError, ValueError):
                continue
            # Tempos fora do pedaço ou fora de ordem são erro do modelo: encaixa depois da frase anterior.
            start = min(max(start, previous_end), max(limit - 0.2, 0.0))
            end = min(max(end, start + 0.2), limit if limit > start else start + 0.2)
            previous_end = end
            segments.append({
                "start": float(round(start + offset, 3)), "end": float(round(end + offset, 3)), "text": text_value,
                "words": _spread_words(text_value, start + offset, end + offset),
            })
    if not segments:
        raise MemberTranscriptionError("gemini", "empty")
    return {"text": " ".join(s["text"] for s in segments), "language": None, "segments": segments}


# ---------------------------------------------------------------------------------------------------------------------
# Entrada
# ---------------------------------------------------------------------------------------------------------------------
def transcribe_with_member_keys(audio_path: Path, *, openai_key: str = "", gemini_key: str = "", language: Optional[str] = None, post: Post = _post) -> dict[str, Any]:
    """Transcreve com a chave do membro. Com as duas, tenta primeiro a OpenAI (tempo por palavra) e depois o Gemini."""
    attempts: list[tuple[str, Callable[..., dict[str, Any]], str]] = []
    if openai_key:
        attempts.append(("openai", transcribe_openai, openai_key))
    if gemini_key:
        attempts.append(("gemini", transcribe_gemini, gemini_key))
    if not attempts:
        raise ValueError("no member key to transcribe with")
    first_error: MemberTranscriptionError | None = None
    for provider, run, key in attempts:
        workdir = Path(tempfile.mkdtemp(prefix="transcricao-"))
        try:
            result = run(key, audio_path, language, workdir, post)
            logger.info("transcrição feita com a chave do membro (%s): %d frases", provider, len(result["segments"]))
            return result
        except MemberTranscriptionError as exc:
            logger.warning("transcrição com a chave do membro falhou (%s: %s)", provider, exc.kind)
            first_error = first_error or exc
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
    raise first_error  # type: ignore[misc]
