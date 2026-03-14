from fastapi import APIRouter, HTTPException
from app.models.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.db import get_supabase
from app.state import (create_project_mem, get_project_mem, list_projects_mem,
                        update_project_mem, delete_project_mem)
from datetime import datetime

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse)
async def create_project(data: ProjectCreate):
    db = get_supabase()
    if db is None:
        return create_project_mem(data.title, data.author, data.description)
    result = db.table("projects").insert({
        "title": data.title, "description": data.description, "author": data.author,
    }).execute()
    return result.data[0]


@router.get("")
async def list_projects():
    db = get_supabase()
    if db is None:
        return list_projects_mem()
    result = db.table("projects").select("*").order("created_at", desc=True).execute()
    return result.data


@router.get("/{project_id}")
async def get_project(project_id: str):
    db = get_supabase()
    if db is None:
        p = get_project_mem(project_id)
        if p is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return p
    result = db.table("projects").select("*").eq("id", project_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return result.data[0]


@router.patch("/{project_id}")
async def update_project(project_id: str, data: ProjectUpdate):
    db = get_supabase()
    if db is None:
        p = update_project_mem(project_id, **data.model_dump(exclude_none=True))
        if p is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return p
    updates = data.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now().isoformat()
    result = db.table("projects").update(updates).eq("id", project_id).execute()
    return result.data[0] if result.data else {}


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    db = get_supabase()
    if db is None:
        delete_project_mem(project_id)
        return {"deleted": True}
    db.table("projects").delete().eq("id", project_id).execute()
    return {"deleted": True}
