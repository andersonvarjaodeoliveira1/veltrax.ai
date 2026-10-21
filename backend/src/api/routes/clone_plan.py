"""Clonagem de Vídeo (BETA): turns a reference video's structure into new ad variations.

Four independent stages so the UI can regenerate any one of them:
variations -> scripts -> images -> videos. Each stage is one LLM call and receives the
output of the previous one from the client. Isolated from the Multiplier jobs: this module
only reuses its auth and small text helpers.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_config
from ...database import get_db
from .multiplier import _check_script_rate, _clip, _user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/multiplier/clone", tags=["multiplier-clone"])

SCENES = 3  # ~8 seconds each, ~24 second ad
MAX_VARIATIONS = 5
MAX_AVATARS = 4
STAGES = ("variations", "scripts", "images", "videos")

RULES = """Originality rules:
- Use the reference video only for its STRUCTURE: hook pattern, pacing and persuasion beats. Never copy its wording, names, brands or the look of real people.
- No celebrities or real people, no children, no medical or before/after claims, no violence, no logos or on-screen brand names.
- Do not invent product facts that were not given."""

VARIATIONS_SYSTEM = f"""You plan short vertical ad variations cloned from a reference video's structure.
You receive the reference transcript, optional notes, a keyword, a call to action and a list of avatars (may be empty).
Return exactly N variations. Each one has a different angle (for example curiosity, problem and solution, storytelling, myth-busting, quick demo, social proof style) and uses one avatar (rotate through the avatars; if there are none, use a neutral description of an everyday person).
Fields: title (3-6 words, Brazilian Portuguese), angle (one short sentence, Brazilian Portuguese), avatar (the avatar name, or "Pessoa comum"), summary (1-2 sentences in Brazilian Portuguese about what happens).
{RULES}"""

SCRIPTS_SYSTEM = f"""You write spoken ad scripts in Brazilian Portuguese, one per variation, in the same order.
Each script has exactly {SCENES} lines, one per 8-second scene, each at most 22 words, natural and conversational.
Line 1 is the hook (at most 18 words) and must stop the scroll. Line {SCENES} must END with the exact call to action sentence you are given, word for word.
Follow each variation's angle. Keep the reference's pacing, not its words.
{RULES}"""

IMAGES_SYSTEM = f"""You write first-frame image prompts for an image model (Nano Banana), 9:16 vertical, one set per variation in the same order.
Each set has exactly {SCENES} prompts in English, one per scene, 250-450 characters each: UGC style, phone camera, natural light.
Every prompt must restate the avatar's look in the same words, so the character stays consistent across scenes, then describe the setting, pose and framing of that scene.
{RULES}"""

VIDEOS_SYSTEM = f"""You write text-to-video prompts for Google Flow / Veo, 9:16 vertical, 8 seconds each, one set per variation in the same order.
Each set has exactly {SCENES} prompts in English, one per scene, 350-600 characters each: UGC style filmed on a phone, natural light.
Restate the avatar's look in the same words in every prompt. Describe the action, camera movement and mood.
Put the scene's spoken line in double quotes, in Brazilian Portuguese, word for word as given, said to camera.
{RULES}"""


class _Variation(BaseModel):
    title: str
    angle: str
    avatar: str
    summary: str


class _Variations(BaseModel):
    items: list[_Variation]


class _Lines(BaseModel):
    lines: list[str] = Field(description=f"Exactly {SCENES} spoken lines")


class _Scripts(BaseModel):
    items: list[_Lines]


class _Prompts(BaseModel):
    prompts: list[str] = Field(description=f"Exactly {SCENES} prompts, one per scene")


class _PromptSets(BaseModel):
    items: list[_Prompts]


def _text(value: Any, limit: int) -> str:
    return _clip(" ".join(str(value or "").split()), limit)


def _context(data: dict[str, Any]) -> dict[str, Any]:
    reference = _text(data.get("reference"), 4000)
    notes = _text(data.get("notes"), 600)
    keyword = _text(data.get("keyword"), 30).upper()
    cta_template = _text(data.get("cta"), 200)
    if len(reference) < 20 and len(notes) < 20:
        raise HTTPException(status_code=400, detail="Send the reference transcript or describe the video")
    if not keyword:
        raise HTTPException(status_code=400, detail="Keyword is required")
    cta = (cta_template or "Comente {KEYWORD} para receber").replace("{KEYWORD}", keyword)
    avatars: list[dict[str, str]] = []
    raw_avatars = data.get("avatars")
    for raw in raw_avatars[:MAX_AVATARS] if isinstance(raw_avatars, list) else []:
        if isinstance(raw, dict) and str(raw.get("name") or "").strip():
            avatars.append({"name": _text(raw.get("name"), 40), "look": _text(raw.get("look"), 300)})
    try:
        count = int(data.get("count") or 3)
    except (TypeError, ValueError):
        count = 3
    return {
        "reference": reference,
        "notes": notes,
        "keyword": keyword,
        "cta": cta,
        "avatars": avatars,
        "count": max(1, min(MAX_VARIATIONS, count)),
    }


def _variations_in(data: dict[str, Any], count: int) -> list[dict[str, str]]:
    raw = data.get("variations")
    if not isinstance(raw, list) or not raw:
        raise HTTPException(status_code=400, detail="Generate the variations first")
    out: list[dict[str, str]] = []
    for item in raw[:count]:
        if isinstance(item, dict) and str(item.get("title") or "").strip():
            out.append(
                {
                    "title": _text(item.get("title"), 80),
                    "angle": _text(item.get("angle"), 200),
                    "avatar": _text(item.get("avatar"), 40) or "Pessoa comum",
                    "summary": _text(item.get("summary"), 300),
                }
            )
    if not out:
        raise HTTPException(status_code=400, detail="Generate the variations first")
    return out


def _avatar_look(avatars: list[dict[str, str]], name: str) -> str:
    for avatar in avatars:
        if avatar["name"].lower() == name.lower():
            return avatar["look"] or "an everyday person"
    return "an everyday person"


def _lines_in(data: dict[str, Any], total: int) -> list[list[str]]:
    raw = data.get("scripts")
    if not isinstance(raw, list) or len(raw) < total:
        raise HTTPException(status_code=400, detail="Generate the scripts first")
    out: list[list[str]] = []
    for item in raw[:total]:
        lines = item.get("lines") if isinstance(item, dict) else None
        if not isinstance(lines, list) or len(lines) < SCENES:
            raise HTTPException(status_code=400, detail="Generate the scripts first")
        out.append([_text(line, 220) for line in lines[:SCENES]])
    return out


async def _build_model() -> Any:
    from ...ai import _build_transcript_model, _get_missing_llm_key_error
    from ...runtime_settings import apply_settings_to_process_env

    runtime_config = get_config()
    apply_settings_to_process_env(runtime_config.as_runtime_settings())
    config_error = _get_missing_llm_key_error(runtime_config.llm, runtime_config)
    if config_error:
        logger.error("clone plan: %s", config_error)
        raise HTTPException(status_code=503, detail="AI is not configured right now")
    return _build_transcript_model(runtime_config)


async def _run(system: str, output_type: type[BaseModel], prompt: str, model: Any = None) -> Any:
    from pydantic_ai import Agent

    if model is None:
        model = await _build_model()
    agent = Agent(model, output_type=output_type, system_prompt=system, output_retries=2)
    try:
        result = await asyncio.wait_for(agent.run(prompt), timeout=120)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI took too long. Try again.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("clone plan stage failed")
        raise HTTPException(status_code=502, detail="Could not generate this step. Try again.")
    return result.output


def _brief(ctx: dict[str, Any]) -> str:
    avatars = "\n".join(f"- {a['name']}: {a['look'] or 'no description'}" for a in ctx["avatars"]) or "(none)"
    return (
        f"Reference transcript:\n{ctx['reference'] or '(not provided)'}\n\n"
        f"Notes about the reference:\n{ctx['notes'] or '(none)'}\n\n"
        f"Keyword: {ctx['keyword']}\nCall to action sentence: {ctx['cta']}\n\nAvatars:\n{avatars}"
    )


def _fit(items: list[Any], total: int) -> None:
    if len(items) < total:
        raise HTTPException(status_code=502, detail="Could not generate this step. Try again.")


async def stage_variations(ctx: dict[str, Any], model: Any = None) -> list[dict[str, str]]:
    count = ctx["count"]
    out = await _run(VARIATIONS_SYSTEM, _Variations, f"N = {count}\n\n{_brief(ctx)}", model)
    items = [
        {
            "title": _text(v.title, 80),
            "angle": _text(v.angle, 200),
            "avatar": _text(v.avatar, 40) or "Pessoa comum",
            "summary": _text(v.summary, 300),
        }
        for v in out.items
        if v.title.strip()
    ]
    _fit(items, count)
    return items[:count]


async def stage_scripts(ctx: dict[str, Any], variations: list[dict[str, str]], model: Any = None) -> list[dict[str, list[str]]]:
    listing = "\n".join(f"{n}. {v['title']} | angle: {v['angle']} | avatar: {v['avatar']} | {v['summary']}" for n, v in enumerate(variations, 1))
    out = await _run(SCRIPTS_SYSTEM, _Scripts, f"{_brief(ctx)}\n\nVariations:\n{listing}", model)
    _fit(out.items, len(variations))
    scripts: list[dict[str, list[str]]] = []
    for item in out.items[: len(variations)]:
        lines = [_text(line, 220) for line in item.lines if line.strip()][:SCENES]
        if len(lines) < SCENES:
            raise HTTPException(status_code=502, detail="Could not generate this step. Try again.")
        if ctx["cta"].lower() not in lines[-1].lower():
            lines[-1] = _text(f"{lines[-1].rstrip()} {ctx['cta']}", 260)
        scripts.append({"lines": lines})
    return scripts


async def _scene_prompts(system: str, ctx: dict[str, Any], variations: list[dict[str, str]], lines: list[list[str]], with_lines: bool, model: Any) -> list[dict[str, list[str]]]:
    blocks = []
    for number, (variation, spoken) in enumerate(zip(variations, lines), 1):
        scene_text = "\n".join(f"   Scene {i}: \"{line}\"" for i, line in enumerate(spoken, 1))
        header = "Spoken lines (put each in its scene)" if with_lines else "Spoken lines (context only, do not write them in the image prompt)"
        blocks.append(
            f"{number}. {variation['title']} ({variation['angle']})\n"
            f"   Avatar look: {_avatar_look(ctx['avatars'], variation['avatar'])}\n"
            f"   {header}:\n{scene_text}"
        )
    out = await _run(system, _PromptSets, "\n\n".join(blocks), model)
    _fit(out.items, len(variations))
    sets: list[dict[str, list[str]]] = []
    for item in out.items[: len(variations)]:
        prompts = [_text(p, 900) for p in item.prompts if p.strip()][:SCENES]
        if len(prompts) < SCENES:
            raise HTTPException(status_code=502, detail="Could not generate this step. Try again.")
        sets.append({"prompts": prompts})
    return sets


async def stage_images(ctx: dict[str, Any], variations: list[dict[str, str]], lines: list[list[str]], model: Any = None):
    return await _scene_prompts(IMAGES_SYSTEM, ctx, variations, lines, False, model)


async def stage_videos(ctx: dict[str, Any], variations: list[dict[str, str]], lines: list[list[str]], model: Any = None):
    return await _scene_prompts(VIDEOS_SYSTEM, ctx, variations, lines, True, model)


@router.post("/generate")
async def generate(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="JSON object expected")
    stage = str(data.get("stage") or "")
    if stage not in STAGES:
        raise HTTPException(status_code=400, detail="Unknown step")
    ctx = _context(data)
    _check_script_rate(user_id)
    if stage == "variations":
        return {"stage": stage, "items": await stage_variations(ctx)}
    variations = _variations_in(data, ctx["count"])
    if stage == "scripts":
        return {"stage": stage, "items": await stage_scripts(ctx, variations)}
    lines = _lines_in(data, len(variations))
    if stage == "images":
        return {"stage": stage, "items": await stage_images(ctx, variations, lines)}
    return {"stage": stage, "items": await stage_videos(ctx, variations, lines)}
