"""Ponte entre o servidor e a conta de IA da pessoa (Gemini, ChatGPT ou Claude no navegador dela).

Quem não tem chave de API pode gerar os textos pela própria conta, usando a extensão:
  1. o servidor precisa de um texto da IA e coloca o pedido na fila da pessoa;
  2. a página do ClipGringa (aberta no navegador dela) busca o pedido (`poll`);
  3. a extensão escreve o pedido no site da IA, espera a resposta e devolve o texto;
  4. a página entrega a resposta ao servidor (`submit_result`) e a geração continua.

Funciona com um único processo da API (o filas ficam em memória). Quem tem chave de API
continua usando a API: a conta só entra depois das chaves da própria pessoa.
"""
from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

SITES = ("gemini", "chatgpt", "claude")
SITE_LABEL = {"gemini": "Gemini", "chatgpt": "ChatGPT", "claude": "Claude"}
READY_TTL = 45.0       # segundos sem sinal da página até considerar a conta desligada
ASK_TIMEOUT = 110.0    # tempo máximo de espera por uma resposta


class RelayError(Exception):
    """Falha ao gerar pela conta. `code`: timeout, login, nopage, blocked ou failed."""

    def __init__(self, site: str, code: str, detail: str = ""):
        super().__init__(f"{site}:{code}:{detail}")
        self.site = site
        self.code = code
        self.detail = detail


@dataclass
class _Job:
    id: str
    system: str
    prompt: str
    future: asyncio.Future[str]
    images: list[dict[str, str]] = field(default_factory=list)


@dataclass
class _Slot:
    site: str = ""
    seen: float = 0.0
    in_flight: int = 0
    queue: list[_Job] = field(default_factory=list)
    wake: asyncio.Event = field(default_factory=asyncio.Event)
    jobs: dict[str, _Job] = field(default_factory=dict)


_slots: dict[str, _Slot] = {}


def _slot(user_id: str) -> _Slot:
    slot = _slots.get(user_id)
    if slot is None:
        slot = _slots[user_id] = _Slot()
    return slot


def heartbeat(user_id: str, site: str) -> None:
    slot = _slot(user_id)
    if site in SITES:
        slot.site = site
    slot.seen = time.monotonic()


def ready_site(user_id: str | None) -> str:
    """Site da conta pronta para gerar agora ('' se a página da pessoa não está respondendo)."""
    if not user_id:
        return ""
    slot = _slots.get(user_id)
    if slot is None or not slot.site:
        return ""
    if slot.in_flight > 0 or time.monotonic() - slot.seen < READY_TTL:
        return slot.site
    return ""


def disconnect(user_id: str) -> None:
    slot = _slots.get(user_id)
    if slot is None:
        return
    slot.seen = 0.0
    slot.site = ""
    for job in list(slot.jobs.values()):
        if not job.future.done():
            job.future.set_exception(RelayError(slot.site or "gemini", "nopage"))
    slot.queue.clear()
    slot.jobs.clear()


async def poll(user_id: str, site: str, wait: float = 20.0) -> dict[str, str] | None:
    """A página da pessoa pergunta se há pedido. Também serve de sinal de que ela está ligada."""
    heartbeat(user_id, site)
    slot = _slot(user_id)
    deadline = time.monotonic() + max(0.0, min(wait, 25.0))
    while True:
        if slot.queue:
            job = slot.queue.pop(0)
            out: dict[str, Any] = {"id": job.id, "system": job.system, "prompt": job.prompt}
            if job.images:
                out["images"] = job.images
            return out
        left = deadline - time.monotonic()
        if left <= 0:
            return None
        slot.wake.clear()
        try:
            await asyncio.wait_for(slot.wake.wait(), timeout=left)
        except asyncio.TimeoutError:
            heartbeat(user_id, site)
            return None


def submit_result(user_id: str, job_id: str, text: str = "", error: str = "") -> bool:
    slot = _slots.get(user_id)
    job = slot.jobs.get(job_id) if slot else None
    if slot is None or job is None:
        return False
    slot.seen = time.monotonic()
    if job.future.done():
        return True
    if error:
        code = error.split(":", 1)[0] if error.split(":", 1)[0] in {"timeout", "login", "nopage", "blocked", "failed"} else "failed"
        job.future.set_exception(RelayError(slot.site or "gemini", code, error[:160]))
    else:
        job.future.set_result(text)
    return True


async def ask(user_id: str, system: str, prompt: str, timeout: float = ASK_TIMEOUT, images: list[dict[str, str]] | None = None) -> str:
    slot = _slot(user_id)
    site = slot.site or "gemini"
    job = _Job(id=uuid.uuid4().hex, system=system, prompt=prompt, future=asyncio.get_running_loop().create_future(), images=images or [])
    slot.jobs[job.id] = job
    slot.queue.append(job)
    slot.in_flight += 1
    slot.wake.set()
    try:
        return await asyncio.wait_for(job.future, timeout=timeout)
    except asyncio.TimeoutError:
        raise RelayError(site, "timeout")
    finally:
        slot.in_flight = max(0, slot.in_flight - 1)
        slot.jobs.pop(job.id, None)
        if job in slot.queue:
            slot.queue.remove(job)


# --- Resposta em JSON a partir de texto de chat -------------------------------------------

def extract_json(text: str) -> str:
    """Tira cercas de markdown e texto em volta, devolvendo só o objeto/lista JSON."""
    body = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", body, re.IGNORECASE)
    if fenced:
        body = fenced.group(1).strip()
    starts = [i for i in (body.find("{"), body.find("[")) if i >= 0]
    if not starts:
        return body
    start = min(starts)
    closer = "}" if body[start] == "{" else "]"
    end = body.rfind(closer)
    if end <= start:
        return body[start:]
    return body[start:end + 1]


def build_chat_prompt(system: str, prompt: str, schema: dict[str, Any] | None, notes: list[str]) -> str:
    parts = []
    if system.strip():
        parts.append("INSTRUÇÕES (siga à risca):\n" + system.strip())
    parts.append("PEDIDO:\n" + prompt.strip())
    if notes:
        parts.append("ATENÇÃO — sua resposta anterior foi recusada:\n" + "\n".join(f"- {n}" for n in notes))
    if schema is not None:
        parts.append(
            "FORMATO DA RESPOSTA: responda SOMENTE com um objeto JSON válido neste esquema, "
            "sem nenhum texto antes ou depois e sem markdown:\n" + json.dumps(schema, ensure_ascii=False)
        )
    return "\n\n".join(parts)


# --- Modelo para o pydantic-ai ------------------------------------------------------------

_path_holder: contextvars.ContextVar[dict[str, str] | None] = contextvars.ContextVar("ai_path_holder", default=None)


def start_path_tracking() -> dict[str, str]:
    holder: dict[str, str] = {}
    _path_holder.set(holder)
    return holder


def set_ai_path(path: str) -> None:
    """Registra por onde a IA respondeu (api:openai, account:gemini ou plan) para avisar a pessoa."""
    holder = _path_holder.get()
    if holder is not None:
        holder["path"] = path


def path_of_model(model: Any) -> str:
    if getattr(model, "is_account_relay", False):
        return f"account:{getattr(model, 'site', 'gemini')}"
    if getattr(model, "is_huggingface", False):
        return "api:huggingface"
    name = type(model).__name__
    for key, label in (("OpenRouter", "openrouter"), ("Ollama", "ollama"), ("Anthropic", "claude"), ("OpenAI", "chatgpt"), ("Google", "gemini")):
        if key in name:
            return f"api:{label}"
    return "plan"


MAX_IMAGES = 8
MAX_IMAGE_BYTES = 6_000_000


def images_of(content: Any) -> list[dict[str, str]]:
    """Imagens (bytes ou data URL) de um pedido, prontas para a extensão colar no chat. Limita quantidade e tamanho."""
    import base64

    if isinstance(content, str):
        return []
    out: list[dict[str, str]] = []
    total = 0
    for item in content:
        mime, b64 = "", ""
        data = getattr(item, "data", None)
        if isinstance(data, (bytes, bytearray)) and str(getattr(item, "media_type", "")).startswith("image/"):
            mime, b64 = item.media_type, base64.b64encode(bytes(data)).decode()
        else:
            url = str(getattr(item, "url", "") or "")
            m = re.match(r"data:(image/[\w.+-]+);base64,(.+)$", url, re.S)
            if m:
                mime, b64 = m.group(1), m.group(2)
        if not b64:
            continue
        total += len(b64)
        if total > MAX_IMAGE_BYTES or len(out) >= MAX_IMAGES:
            break
        out.append({"mime": mime, "data": b64})
    return out


def account_model(user_id: str | None) -> Any | None:
    """Modelo que gera pela conta da pessoa, ou None quando a página dela não está ligada."""
    site = ready_site(user_id)
    if not site or not user_id:
        return None
    from pydantic_ai.messages import ModelMessage, ModelResponse, RetryPromptPart, SystemPromptPart, ToolCallPart, UserPromptPart
    from pydantic_ai.models.function import AgentInfo, FunctionModel

    async def respond(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        system = ""
        prompt = ""
        images: list[dict[str, str]] = []
        notes: list[str] = []
        for message in messages:
            for part in getattr(message, "parts", []):
                if isinstance(part, SystemPromptPart):
                    system += part.content + "\n"
                elif isinstance(part, UserPromptPart):
                    prompt = part.content if isinstance(part.content, str) else " ".join(str(c) for c in part.content if isinstance(c, str))
                    images = images_of(part.content) or images
                elif isinstance(part, RetryPromptPart):
                    notes = [str(part.content)[:400]]
        tool = info.output_tools[0] if info.output_tools else None
        text = await ask(user_id, "", build_chat_prompt(system, prompt, tool.parameters_json_schema if tool else None, notes), images=images)
        if tool is None:
            from pydantic_ai.messages import TextPart

            return ModelResponse(parts=[TextPart(content=text)])
        return ModelResponse(parts=[ToolCallPart(tool_name=tool.name, args=extract_json(text))])

    model = FunctionModel(respond, model_name=f"conta-{site}")
    model.is_account_relay = True  # type: ignore[attr-defined]
    model.site = site  # type: ignore[attr-defined]
    return model
