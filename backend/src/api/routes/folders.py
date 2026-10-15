"""
Library folders: group generations (and their stored videos) into folders.

All queries are scoped to the authenticated user. Deleting a folder never
deletes videos; they simply go back to "no folder".
"""

import logging
import uuid
from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import resolve_authenticated_user_id
from ...config import get_config
from ...database import get_db
from ...services.video_service import UPLOAD_URL_PREFIX

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/folders", tags=["folders"])

MAX_FOLDERS_PER_USER = 100
MAX_NAME_LENGTH = 80
MAX_MOVE_BATCH = 200


async def _user_id(request: Request, db: AsyncSession) -> str:
    return await resolve_authenticated_user_id(request, db, get_config())


async def _json_object(request: Request) -> dict[str, Any]:
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="JSON object expected")
    return data


def _clean_name(value: Any) -> str:
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail="Folder name is required")
    name = " ".join(value.split())
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    if len(name) > MAX_NAME_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Folder name must be at most {MAX_NAME_LENGTH} characters",
        )
    return name


def _folder_row(row: Any) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "task_count": getattr(row, "task_count", 0) or 0,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


@router.get("")
@router.get("/")
async def list_folders(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    result = await db.execute(
        text(
            """
            SELECT f.id, f.name, f.created_at, f.updated_at,
                   (SELECT COUNT(*) FROM tasks t
                    WHERE t.folder_id = f.id AND t.user_id = f.user_id) AS task_count
            FROM folders f
            WHERE f.user_id = :user_id
            ORDER BY LOWER(f.name) ASC
            """
        ),
        {"user_id": user_id},
    )
    folders = [_folder_row(row) for row in result.fetchall()]
    return {"folders": folders, "total": len(folders)}


@router.post("")
@router.post("/")
async def create_folder(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(request, db)
    data = await _json_object(request)
    name = _clean_name(data.get("name"))

    count = (
        await db.execute(
            text("SELECT COUNT(*) FROM folders WHERE user_id = :user_id"),
            {"user_id": user_id},
        )
    ).scalar_one()
    if count >= MAX_FOLDERS_PER_USER:
        raise HTTPException(status_code=409, detail="Folder limit reached")

    folder_id = str(uuid.uuid4())
    await db.execute(
        text(
            "INSERT INTO folders (id, user_id, name) VALUES (:id, :user_id, :name)"
        ),
        {"id": folder_id, "user_id": user_id, "name": name},
    )
    await db.commit()
    return {"id": folder_id, "name": name, "task_count": 0}


@router.post("/move")
async def move_tasks(request: Request, db: AsyncSession = Depends(get_db)):
    """Move generations into a folder (``folder_id`` null = remove from folder)."""
    user_id = await _user_id(request, db)
    data = await _json_object(request)

    task_ids = data.get("task_ids")
    if (
        not isinstance(task_ids, list)
        or not task_ids
        or len(task_ids) > MAX_MOVE_BATCH
        or not all(isinstance(item, str) and 0 < len(item) <= 64 for item in task_ids)
    ):
        raise HTTPException(status_code=400, detail="task_ids must be a non-empty list")

    folder_id: Optional[str] = data.get("folder_id")
    if folder_id is not None:
        if not isinstance(folder_id, str):
            raise HTTPException(status_code=400, detail="Invalid folder_id")
        owned = await db.execute(
            text("SELECT 1 FROM folders WHERE id = :id AND user_id = :user_id"),
            {"id": folder_id, "user_id": user_id},
        )
        if owned.scalar() is None:
            raise HTTPException(status_code=404, detail="Folder not found")

    statement = text(
        "UPDATE tasks SET folder_id = :folder_id "
        "WHERE user_id = :user_id AND id IN :task_ids"
    ).bindparams(bindparam("task_ids", expanding=True))
    result = await db.execute(
        statement,
        {"folder_id": folder_id, "user_id": user_id, "task_ids": task_ids},
    )
    await db.commit()
    return {"moved": result.rowcount}


@router.patch("/{folder_id}")
async def rename_folder(
    folder_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    user_id = await _user_id(request, db)
    data = await _json_object(request)
    name = _clean_name(data.get("name"))
    result = await db.execute(
        text(
            "UPDATE folders SET name = :name, updated_at = NOW() "
            "WHERE id = :id AND user_id = :user_id"
        ),
        {"name": name, "id": folder_id, "user_id": user_id},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"id": folder_id, "name": name}


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    user_id = await _user_id(request, db)
    owned = await db.execute(
        text("SELECT 1 FROM folders WHERE id = :id AND user_id = :user_id"),
        {"id": folder_id, "user_id": user_id},
    )
    if owned.scalar() is None:
        raise HTTPException(status_code=404, detail="Folder not found")

    await db.execute(
        text(
            "UPDATE tasks SET folder_id = NULL "
            "WHERE folder_id = :id AND user_id = :user_id"
        ),
        {"id": folder_id, "user_id": user_id},
    )
    await db.execute(
        text("DELETE FROM folders WHERE id = :id AND user_id = :user_id"),
        {"id": folder_id, "user_id": user_id},
    )
    await db.commit()
    return {"message": "Folder deleted"}


@router.get("/original/{task_id}")
async def download_original_video(
    task_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Download the stored original video of an uploaded generation."""
    user_id = await _user_id(request, db)
    row = (
        await db.execute(
            text(
                """
                SELECT s.url AS url, s.title AS title
                FROM tasks t JOIN sources s ON s.id = t.source_id
                WHERE t.id = :task_id AND t.user_id = :user_id
                """
            ),
            {"task_id": task_id, "user_id": user_id},
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")

    url: str = row.url or ""
    if not url.startswith(UPLOAD_URL_PREFIX):
        raise HTTPException(
            status_code=404, detail="No stored original for this generation"
        )

    filename = Path(url.removeprefix(UPLOAD_URL_PREFIX)).name
    video_path = Path(get_config().temp_dir) / "uploads" / filename
    if not video_path.is_file():
        raise HTTPException(status_code=404, detail="Original video not found")

    await db.close()
    safe_title = "".join(
        ch for ch in (row.title or "video") if ch.isalnum() or ch in " -_."
    ).strip() or "video"
    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=f"{safe_title}{video_path.suffix or '.mp4'}",
        content_disposition_type="attachment",
        headers={"Cache-Control": "private, no-store"},
    )
