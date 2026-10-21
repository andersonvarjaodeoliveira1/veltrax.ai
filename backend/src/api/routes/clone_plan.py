"""Clonagem de Vídeo (BETA), following the "Protocolo Árvore".

The validated copy is the trunk, the variations are the branches: every variation keeps the
same message and spoken lines; only the avatar and the way it is shown change. The call to
action is kept separate so it can be locked and stays identical in all variations.

Four independent stages so the UI can regenerate any one of them:
scenes -> variations -> images -> videos. Each stage is one LLM call and receives the output of
the previous ones from the client. Isolated from the Multiplier jobs: this module only reuses
its auth and small text helpers.
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

MAX_SCENES = 3  # ~8 seconds each (one Veo clip); the member picks 1 to 3
SCENES = MAX_SCENES
MAX_VARIATIONS = 10
MAX_AVATARS = 4
MIX_OPTIONS = 3
STAGES = ("scenes", "mix", "variations", "images", "videos")

SAFETY = """Safety rules for everything you write:
- No celebrities or real people, no children, no violence, no logos or on-screen brand names.
- No medical or before/after claims, and do not invent product facts that were not given."""

def scenes_system(n: int) -> str:
    return f"""You analyse a validated ad (the "trunk" copy) and split it into exactly {n} scene{"s" if n != 1 else ""} of about 8 seconds each, in order.
You receive the transcript of the reference video and/or notes about it.
Preserve the message, the mechanism and the sequence. Do not add new ideas.
For each scene return:
- what: one sentence in Brazilian Portuguese about what happens and is shown in the scene.
- line: the spoken text of the scene in Brazilian Portuguese, taken from the transcript, same words and order. Condense only if it is longer than about 22 words. If there is no transcript, write it from the notes.
The final call to action is added separately later, so the last scene's line must stop BEFORE any call to action (such as "comment X to get it"). Do not include it.
{SAFETY}"""

MIX_SYSTEM = f"""You write alternative openings, bodies and calls to action for the same video, so they can be mixed into new versions.
You receive the scenes of the validated ad (what happens and the spoken line) and, optionally, the product.
Keep the same offer, mechanism and promise; only change the way it is said. Write in Brazilian Portuguese, natural and spoken.
Return:
- hooks: N alternative openings (scene 1), each at most 18 words, each with a different angle (curiosity, problem, bold claim, question...).
- bodies: N alternative middles (scene 2), each at most 22 words, same mechanism, different wording or example.
- ctas: N alternative closings (scene 3), each at most 20 words, each asking to comment the keyword. Each CTA MUST contain the literal text {{KEYWORD}}, exactly once.
{SAFETY}"""

VARIATIONS_SYSTEM = f"""You plan N variations of the same video. The message and the spoken lines stay EXACTLY the same in all variations: only who presents it and how it is shown change.
You receive the scenes (what happens and the spoken line), an avatar mode and, for "own", a list of avatars.
Return exactly N variations. Each has:
- title: 3-6 words in Brazilian Portuguese.
- avatar: the avatar name (for "random", invent a short first name).
- look: 15-30 words in English describing the person's appearance (age range, hair, clothing). Make each variation clearly different from the others.
- setting: short, in Brazilian Portuguese, where and how it is filmed (for example "dentro do carro, câmera frontal").
- summary: one sentence in Brazilian Portuguese on how this variation presents the same message.
Avatar mode "own": use the given avatars in rotation and copy their look word for word (translate to English if needed). Avatar mode "random": invent N different everyday adult avatars.
{SAFETY}"""

def images_system(n: int) -> str:
    return f"""You write first-frame image prompts for an image model (Nano Banana), 9:16 vertical, one set per variation in the same order.
Each set has exactly {n} prompt{"s" if n != 1 else ""} in English, one per scene, 250-450 characters each: UGC style, phone camera, natural light.
Every prompt must restate the variation's look in the same words, so the same person appears in all scenes, then use the variation's setting and show what happens in that scene.
No text on screen.
{SAFETY}"""

def videos_system(n: int) -> str:
    return f"""You write image-to-video prompts for Google Flow / Veo, 9:16 vertical, 8 seconds each, one set per variation in the same order.
The approved image of the scene is used as the first frame, so do not redescribe the person's appearance: describe the movement, the camera and the mood, and keep the same person and setting.
Each set has exactly {n} prompt{"s" if n != 1 else ""} in English, one per scene, 250-500 characters each.
Put the scene's spoken line in double quotes, in Brazilian Portuguese, word for word as given, said to camera. Never change, shorten or translate it.
{SAFETY}"""


class _Scene(BaseModel):
    what: str
    line: str


class _Scenes(BaseModel):
    items: list[_Scene]


class _Mix(BaseModel):
    hooks: list[str]
    bodies: list[str]
    ctas: list[str]


class _Variation(BaseModel):
    title: str
    avatar: str
    look: str
    setting: str
    summary: str


class _Variations(BaseModel):
    items: list[_Variation]


class _Prompts(BaseModel):
    prompts: list[str] = Field(description="One prompt per scene")


class _PromptSets(BaseModel):
    items: list[_Prompts]


def _text(value: Any, limit: int) -> str:
    return _clip(" ".join(str(value or "").split()), limit)


def _context(data: dict[str, Any], need_cta: bool = False) -> dict[str, Any]:
    reference = _text(data.get("reference"), 4000)
    notes = _text(data.get("notes"), 600)
    if len(reference) < 20 and len(notes) < 20:
        raise HTTPException(status_code=400, detail="Send the reference transcript or describe the video")
    keyword = _text(data.get("keyword"), 30)
    if data.get("keep_case") is not True:
        keyword = keyword.upper()
    if need_cta and not keyword:
        raise HTTPException(status_code=400, detail="Keyword is required")
    cta_template = _text(data.get("cta"), 200) or "Comente {KEYWORD} para assistir o vídeo completo"
    cta = cta_template.replace("{KEYWORD}", keyword or "PALAVRA")
    avatars: list[dict[str, str]] = []
    raw_avatars = data.get("avatars")
    for raw in raw_avatars[:MAX_AVATARS] if isinstance(raw_avatars, list) else []:
        if isinstance(raw, dict) and str(raw.get("name") or "").strip():
            avatars.append({"name": _text(raw.get("name"), 40), "look": _text(raw.get("look"), 300)})
    mode = "own" if data.get("avatar_mode") == "own" and avatars else "random"
    try:
        count = int(data.get("count") or 3)
    except (TypeError, ValueError):
        count = 3
    try:
        scene_count = int(data.get("scene_count") or MAX_SCENES)
    except (TypeError, ValueError):
        scene_count = MAX_SCENES
    return {
        "scene_count": max(1, min(MAX_SCENES, scene_count)),
        "reference": reference,
        "notes": notes,
        "product": _text(data.get("product"), 120),
        "keyword": keyword,
        "cta": cta,
        "avatars": avatars,
        "mode": mode,
        "count": max(1, min(MAX_VARIATIONS, count)),
    }


def _scenes_in(data: dict[str, Any], n: int = MAX_SCENES) -> list[dict[str, str]]:
    raw = data.get("scenes")
    if not isinstance(raw, list) or len(raw) < n:
        raise HTTPException(status_code=400, detail="Generate the scenes first")
    out = [
        {"what": _text(item.get("what"), 240), "line": _text(item.get("line"), 300)}
        for item in raw[:n]
        if isinstance(item, dict) and str(item.get("line") or "").strip()
    ]
    if len(out) < n:
        raise HTTPException(status_code=400, detail="Generate the scenes first")
    return out


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
                    "avatar": _text(item.get("avatar"), 40) or "Pessoa comum",
                    "look": _text(item.get("look"), 300) or "an everyday adult",
                    "setting": _text(item.get("setting"), 160),
                    "summary": _text(item.get("summary"), 300),
                }
            )
    if not out:
        raise HTTPException(status_code=400, detail="Generate the variations first")
    return out


def _spoken(scenes: list[dict[str, str]], cta: str) -> list[str]:
    """Spoken lines per scene. The locked CTA closes the last scene, identical everywhere."""
    lines = [scene["line"] for scene in scenes]
    lines[-1] = _text(f"{lines[-1].rstrip()} {cta}", 400)
    return lines


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


def _fail() -> HTTPException:
    return HTTPException(status_code=502, detail="Could not generate this step. Try again.")


async def stage_scenes(ctx: dict[str, Any], model: Any = None) -> list[dict[str, str]]:
    prompt = f"Reference transcript:\n{ctx['reference'] or '(not provided)'}\n\nNotes about the video:\n{ctx['notes'] or '(none)'}"
    n = ctx["scene_count"]
    out = await _run(scenes_system(n), _Scenes, prompt, model)
    scenes = [{"what": _text(s.what, 240), "line": _text(s.line, 300)} for s in out.items if s.line.strip()]
    if len(scenes) < n:
        raise _fail()
    return scenes[:n]


async def stage_mix(ctx: dict[str, Any], scenes: list[dict[str, str]], model: Any = None) -> dict[str, list[str]]:
    prompt = f"N = {MIX_OPTIONS}\nProduct: {ctx['product'] or '(not given)'}\n\nScenes:\n{_scene_block(scenes, [scene['line'] for scene in scenes])}"
    out = await _run(MIX_SYSTEM, _Mix, prompt, model)
    hooks = [_text(v, 160) for v in out.hooks if v.strip()][:MIX_OPTIONS]
    bodies = [_text(v, 220) for v in out.bodies if v.strip()][:MIX_OPTIONS]
    ctas = [_text(v, 200) for v in out.ctas if v.strip() and v.count("{KEYWORD}") == 1][:MIX_OPTIONS]
    if len(hooks) < 2 or len(bodies) < 2 or len(ctas) < 2:
        raise _fail()
    return {"hooks": hooks, "bodies": bodies, "ctas": ctas}


def _scene_block(scenes: list[dict[str, str]], lines: list[str] | None = None) -> str:
    return "\n".join(
        f"Scene {i}: {scene['what']}" + (f"\n   Spoken line: \"{lines[i - 1]}\"" if lines else "")
        for i, scene in enumerate(scenes, 1)
    )


async def stage_variations(ctx: dict[str, Any], scenes: list[dict[str, str]], model: Any = None) -> list[dict[str, str]]:
    count = ctx["count"]
    avatars = "\n".join(f"- {a['name']}: {a['look'] or 'no description'}" for a in ctx["avatars"]) or "(none)"
    prompt = f"N = {count}\nAvatar mode: {ctx['mode']}\n\nScenes:\n{_scene_block(scenes)}\n\nAvatars:\n{avatars}"
    out = await _run(VARIATIONS_SYSTEM, _Variations, prompt, model)
    items = [
        {
            "title": _text(v.title, 80),
            "avatar": _text(v.avatar, 40) or "Pessoa comum",
            "look": _text(v.look, 300),
            "setting": _text(v.setting, 160),
            "summary": _text(v.summary, 300),
        }
        for v in out.items
        if v.title.strip() and v.look.strip()
    ]
    if len(items) < count:
        raise _fail()
    return items[:count]


def _lines_in(data: dict[str, Any], scenes: list[dict[str, str]], cta: str, total: int) -> list[list[str]]:
    """Spoken lines per variation. Mixed versions send their own lines; otherwise every variation
    says the same trunk lines and the locked CTA closes the last scene."""
    raw = data.get("lines")
    if isinstance(raw, list) and len(raw) >= total:
        n = len(scenes)
        out = [[_text(line, 400) for line in item[:n]] for item in raw[:total] if isinstance(item, list) and len(item) >= n]
        if len(out) == total and all(all(line for line in item) for item in out):
            return out
        raise HTTPException(status_code=400, detail="Generate the scenes first")
    return [_spoken(scenes, cta) for _ in range(total)]


async def _scene_prompts(system: str, scenes: list[dict[str, str]], variations: list[dict[str, str]], lines: list[list[str]] | None, model: Any):
    blocks = [
        f"{number}. {v['title']}\n   Look: {v['look']}\n   Setting: {v['setting'] or 'free'}\n   Scenes:\n"
        + "\n".join(f"   {line}" for line in _scene_block(scenes, lines[number - 1] if lines else None).splitlines())
        for number, v in enumerate(variations, 1)
    ]
    out = await _run(system, _PromptSets, "\n\n".join(blocks), model)
    if len(out.items) < len(variations):
        raise _fail()
    sets: list[dict[str, list[str]]] = []
    for item in out.items[: len(variations)]:
        prompts = [_text(p, 900) for p in item.prompts if p.strip()][: len(scenes)]
        if len(prompts) < len(scenes):
            raise _fail()
        sets.append({"prompts": prompts})
    return sets


async def stage_images(ctx: dict[str, Any], scenes: list[dict[str, str]], variations: list[dict[str, str]], model: Any = None):
    return await _scene_prompts(images_system(len(scenes)), scenes, variations, None, model)


async def stage_videos(ctx: dict[str, Any], scenes: list[dict[str, str]], variations: list[dict[str, str]], lines: list[list[str]], model: Any = None):
    return await _scene_prompts(videos_system(len(scenes)), scenes, variations, lines, model)


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
    ctx = _context(data, need_cta=stage == "videos")
    _check_script_rate(user_id)
    if stage == "scenes":
        return {"stage": stage, "items": await stage_scenes(ctx)}
    scenes = _scenes_in(data, ctx["scene_count"])
    if stage == "mix":
        return {"stage": stage, **(await stage_mix(ctx, scenes))}
    if stage == "variations":
        return {"stage": stage, "items": await stage_variations(ctx, scenes)}
    variations = _variations_in(data, ctx["count"])
    if stage == "images":
        return {"stage": stage, "items": await stage_images(ctx, scenes, variations)}
    lines = _lines_in(data, scenes, ctx["cta"], len(variations))
    return {"stage": stage, "items": await stage_videos(ctx, scenes, variations, lines)}
