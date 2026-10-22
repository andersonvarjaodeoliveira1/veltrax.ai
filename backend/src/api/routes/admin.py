from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import require_admin_user
from ...ai import _get_missing_llm_key_error
from ...config import get_config
from ...database import get_db
from ...runtime_settings import (
    RUNTIME_SETTING_KEYS,
    encrypt_setting_value,
    get_runtime_setting_rows,
    load_runtime_settings_cache,
)

router = APIRouter(prefix="/admin", tags=["admin"])


SETTING_METADATA = {
    "ASSEMBLY_AI_API_KEY": {
        "label": "AssemblyAI API key",
        "description": "Used for video transcription.",
        "input_type": "password",
    },
    "LLM": {
        "label": "LLM model",
        "description": "Provider and model, for example openai:gpt-5.2.",
        "input_type": "text",
    },
    "OPENAI_API_KEY": {
        "label": "OpenAI API key",
        "description": "Required for openai:* models.",
        "input_type": "password",
    },
    "OPENROUTER_API_KEY": {
        "label": "OpenRouter API key",
        "description": "Required for openrouter:* models, including Sonnet with Luna fallback.",
        "input_type": "password",
    },
    "GOOGLE_API_KEY": {
        "label": "Google API key",
        "description": "Required for google-gla:* models and fallback YouTube metadata.",
        "input_type": "password",
    },
    "ANTHROPIC_API_KEY": {
        "label": "Anthropic API key",
        "description": "Required for anthropic:* models.",
        "input_type": "password",
    },
    "OLLAMA_BASE_URL": {
        "label": "Ollama base URL",
        "description": "Optional URL for local or hosted Ollama-compatible endpoints.",
        "input_type": "text",
    },
    "OLLAMA_API_KEY": {
        "label": "Ollama API key",
        "description": "Optional, used by hosted Ollama-compatible providers.",
        "input_type": "password",
    },
    "YOUTUBE_DATA_API_KEY": {
        "label": "YouTube Data API key",
        "description": "Optional metadata provider key.",
        "input_type": "password",
    },
    "APIFY_API_TOKEN": {
        "label": "Apify API token",
        "description": "Optional YouTube download fallback provider token.",
        "input_type": "password",
    },
    "PEXELS_API_KEY": {
        "label": "Pexels API key",
        "description": "Optional B-roll stock footage provider key.",
        "input_type": "password",
    },
    "VEO_API_KEY": {
        "label": "Veo / Flow API key",
        "description": "Credential for Veo video generation (Automação, BETA).",
        "input_type": "password",
    },
    "VEO_PROJECT_ID": {
        "label": "Veo / Flow Google Cloud project",
        "description": "Google Cloud project number used for Veo (Automação, BETA).",
        "input_type": "text",
    },
}


class RuntimeSettingsUpdate(BaseModel):
    updates: dict[str, str] = Field(default_factory=dict)
    delete_keys: list[str] = Field(default_factory=list)
    prefer_admin_values: dict[str, bool] = Field(default_factory=dict)


def _setting_status(
    setting_key: str, rows: dict[str, dict[str, object]]
):
    env_value = get_config()._get_optional_env(setting_key)
    has_env = bool(env_value)
    row = rows.get(setting_key, {})
    has_admin_value = bool(row.get("encrypted_value"))
    prefer_admin_value = bool(row.get("prefer_admin_value"))
    metadata = SETTING_METADATA[setting_key]

    if has_admin_value and (prefer_admin_value or not has_env):
        source = "admin"
    elif has_env:
        source = "environment"
    else:
        source = "unset"

    return {
        "key": setting_key,
        "label": metadata["label"],
        "description": metadata["description"],
        "input_type": metadata["input_type"],
        "source": source,
        "configured": has_env or has_admin_value,
        "has_admin_value": has_admin_value,
        "has_env_value": has_env,
        "prefer_admin_value": prefer_admin_value,
        "overridden_by_env": has_env and has_admin_value and not prefer_admin_value,
        "updated_at": row.get("updated_at"),
    }


@router.get("/health")
async def admin_health(
    request: Request, db: AsyncSession = Depends(get_db)
):
    await require_admin_user(request, db, get_config())
    return {"status": "ok"}


@router.get("/runtime-settings")
async def get_runtime_settings(request: Request, db: AsyncSession = Depends(get_db)):
    await require_admin_user(request, db, get_config())
    rows = await get_runtime_setting_rows(db)
    return {
        "settings": [
            _setting_status(setting_key, rows) for setting_key in RUNTIME_SETTING_KEYS
        ]
    }


@router.patch("/runtime-settings")
async def update_runtime_settings(
    request: Request,
    payload: RuntimeSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    user_id = await require_admin_user(request, db, get_config())
    allowed_keys = set(RUNTIME_SETTING_KEYS)
    invalid_keys = [
        key
        for key in [
            *payload.updates.keys(),
            *payload.delete_keys,
            *payload.prefer_admin_values.keys(),
        ]
        if key not in allowed_keys
    ]
    if invalid_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported setting key(s): {', '.join(sorted(set(invalid_keys)))}",
        )

    if "LLM" in payload.updates:
        config_error = _get_missing_llm_key_error(
            payload.updates["LLM"].strip(), get_config()
        )
        if config_error and "API_KEY is not set" not in config_error:
            raise HTTPException(status_code=400, detail=config_error)

    for setting_key, raw_value in payload.updates.items():
        value = raw_value.strip()
        if not value:
            continue
        encrypted_value = encrypt_setting_value(value)
        await db.execute(
            text(
                """
                INSERT INTO app_settings (setting_key, encrypted_value, updated_by)
                VALUES (:setting_key, :encrypted_value, :updated_by)
                ON CONFLICT (setting_key) DO UPDATE
                SET encrypted_value = EXCLUDED.encrypted_value,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = CURRENT_TIMESTAMP
                """
            ),
            {
                "setting_key": setting_key,
                "encrypted_value": encrypted_value,
                "updated_by": user_id,
            },
        )

    for setting_key, prefer_admin_value in payload.prefer_admin_values.items():
        await db.execute(
            text(
                """
                UPDATE app_settings
                SET prefer_admin_value = :prefer_admin_value,
                    updated_by = :updated_by,
                    updated_at = CURRENT_TIMESTAMP
                WHERE setting_key = :setting_key
                """
            ),
            {
                "setting_key": setting_key,
                "prefer_admin_value": prefer_admin_value,
                "updated_by": user_id,
            },
        )

    if payload.delete_keys:
        await db.execute(
            text(
                """
                DELETE FROM app_settings
                WHERE setting_key = ANY(CAST(:setting_keys AS text[]))
                """
            ),
            {"setting_keys": payload.delete_keys},
        )

    await db.commit()
    await load_runtime_settings_cache(db)

    rows = await get_runtime_setting_rows(db)
    return {
        "settings": [
            _setting_status(setting_key, rows) for setting_key in RUNTIME_SETTING_KEYS
        ]
    }


# ---------------------------------------------------------------------------
# Uso por usuário: tokens gastos e vídeos gerados (somente administrador)
# ---------------------------------------------------------------------------


@router.get("/usage")
async def users_usage(request: Request, db: AsyncSession = Depends(get_db)):
    await require_admin_user(request, db, get_config())
    rows = (
        await db.execute(
            text(
                """
                SELECT u.id, u.email, u.name, u."createdAt" AS created_at,
                       COALESCE(l.tin, 0) AS tokens_in, COALESCE(l.tout, 0) AS tokens_out,
                       COALESCE(l.tin30, 0) AS tokens_in_30d, COALESCE(l.tout30, 0) AS tokens_out_30d,
                       COALESCE(l.own, 0) AS tokens_own_key, COALESCE(l.server_used, 0) AS server_used,
                       u.is_admin AS is_admin, q.granted AS granted, COALESCE(l.calls, 0) AS calls,
                       COALESCE(j.jobs, 0) AS jobs, COALESCE(j.videos, 0) AS videos,
                       COALESCE(c.clips, 0) AS clips
                FROM users u
                LEFT JOIN (
                    SELECT user_id,
                           SUM(input_tokens) AS tin, SUM(output_tokens) AS tout,
                           SUM(input_tokens) FILTER (WHERE created_at > now() - interval '30 days') AS tin30,
                           SUM(output_tokens) FILTER (WHERE created_at > now() - interval '30 days') AS tout30,
                           SUM(input_tokens + output_tokens) FILTER (WHERE own_key) AS own,
                           SUM(input_tokens + output_tokens) FILTER (WHERE NOT own_key) AS server_used,
                           COUNT(*) AS calls
                    FROM llm_usage GROUP BY user_id
                ) l ON l.user_id = u.id
                LEFT JOIN user_token_quota q ON q.user_id = u.id
                LEFT JOIN (
                    SELECT user_id, COUNT(*) AS jobs, COALESCE(SUM(done), 0) AS videos
                    FROM multiplier_jobs GROUP BY user_id
                ) j ON j.user_id = u.id
                LEFT JOIN (
                    SELECT t.user_id, COUNT(*) AS clips
                    FROM generated_clips g JOIN tasks t ON t.id = g.task_id GROUP BY t.user_id
                ) c ON c.user_id = u.id
                ORDER BY COALESCE(l.tin, 0) + COALESCE(l.tout, 0) DESC, u."createdAt" DESC
                LIMIT 500
                """
            )
        )
    ).mappings().all()
    numeric = ("tokens_in", "tokens_out", "tokens_in_30d", "tokens_out_30d", "tokens_own_key", "calls", "jobs", "videos", "clips")
    users = []
    for row in rows:
        item = {"id": row["id"], "email": row["email"], "name": row["name"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None}
        item.update({key: int(row[key] or 0) for key in numeric})
        from ...usage import balance_from

        item["balance"] = balance_from(bool(row["is_admin"]), row["granted"], int(row["server_used"] or 0))
        users.append(item)
    return {"users": users}


@router.get("/users/{user_id}/videos")
async def user_videos(user_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    await require_admin_user(request, db, get_config())
    import json

    jobs = (
        await db.execute(
            text(
                "SELECT id, status, total, done, outputs, created_at FROM multiplier_jobs "
                "WHERE user_id = :u ORDER BY created_at DESC LIMIT 50"
            ),
            {"u": user_id},
        )
    ).mappings().all()
    out_jobs = []
    for job in jobs:
        try:
            outputs = json.loads(job["outputs"] or "[]")
        except Exception:
            outputs = []
        out_jobs.append({
            "id": job["id"], "status": job["status"], "total": job["total"], "done": job["done"],
            "created_at": job["created_at"].isoformat() if job["created_at"] else None,
            "videos": [
                {"index": o.get("index"), "label": o.get("label") or f"Vídeo {o.get('index')}"}
                for o in outputs if o.get("status") == "ready"
            ],
        })
    clips = (
        await db.execute(
            text(
                "SELECT g.id, g.filename, g.duration, g.created_at, t.id AS task_id "
                "FROM generated_clips g JOIN tasks t ON t.id = g.task_id "
                "WHERE t.user_id = :u ORDER BY g.created_at DESC LIMIT 50"
            ),
            {"u": user_id},
        )
    ).mappings().all()
    usage = (
        await db.execute(
            text(
                "SELECT stage, model, input_tokens, output_tokens, own_key, created_at FROM llm_usage "
                "WHERE user_id = :u ORDER BY created_at DESC LIMIT 100"
            ),
            {"u": user_id},
        )
    ).mappings().all()
    return {
        "jobs": out_jobs,
        "clips": [
            {"id": c["id"], "filename": c["filename"], "duration": float(c["duration"] or 0),
             "created_at": c["created_at"].isoformat() if c["created_at"] else None, "task_id": c["task_id"]}
            for c in clips
        ],
        "usage": [
            {"stage": r["stage"], "model": r["model"], "input_tokens": r["input_tokens"],
             "output_tokens": r["output_tokens"], "own_key": r["own_key"],
             "created_at": r["created_at"].isoformat() if r["created_at"] else None}
            for r in usage
        ],
    }


@router.get("/jobs/{job_id}/outputs/{index}")
async def admin_job_output(job_id: str, index: int, request: Request, download: bool = False, db: AsyncSession = Depends(get_db)):
    await require_admin_user(request, db, get_config())
    import json

    from fastapi.responses import FileResponse

    from .multiplier import _job_dir, _parse_uuid, _ready_file

    row = (await db.execute(text("SELECT id, outputs FROM multiplier_jobs WHERE id = :i"), {"i": _parse_uuid(job_id)})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    outputs = json.loads(row["outputs"] or "[]")
    path = _ready_file(row["id"], outputs, index)
    label = next((o.get("label") for o in outputs if o.get("index") == index), f"video-{index}")
    return FileResponse(
        path=str(path), media_type="video/mp4", filename=f"{label}.mp4",
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, no-store"},
    )


class TokenGrant(BaseModel):
    add: int | None = Field(default=None, ge=-100_000_000, le=100_000_000)
    set: int | None = Field(default=None, ge=0, le=1_000_000_000)


@router.put("/users/{user_id}/tokens")
async def grant_tokens(user_id: str, body: TokenGrant, request: Request, db: AsyncSession = Depends(get_db)):
    """Libera tokens para um membro: soma (add) ou define o total (set). O saldo restante é total - gasto."""
    await require_admin_user(request, db, get_config())
    from ...usage import DEFAULT_QUOTA, balance_from

    if (body.add is None) == (body.set is None):
        raise HTTPException(status_code=400, detail="Send either add or set")
    exists = (await db.execute(text("SELECT is_admin FROM users WHERE id = :u"), {"u": user_id})).mappings().first()
    if not exists:
        raise HTTPException(status_code=404, detail="User not found")
    current = (await db.execute(text("SELECT granted FROM user_token_quota WHERE user_id = :u"), {"u": user_id})).scalar()
    base = DEFAULT_QUOTA if current is None else int(current)
    new_total = max(0, body.set if body.set is not None else base + int(body.add or 0))
    await db.execute(
        text(
            "INSERT INTO user_token_quota (user_id, granted) VALUES (:u, :g) "
            "ON CONFLICT (user_id) DO UPDATE SET granted = EXCLUDED.granted, updated_at = CURRENT_TIMESTAMP"
        ),
        {"u": user_id, "g": new_total},
    )
    await db.commit()
    used = (await db.execute(text("SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM llm_usage WHERE user_id = :u AND NOT own_key"), {"u": user_id})).scalar()
    return balance_from(bool(exists["is_admin"]), new_total, int(used or 0))
