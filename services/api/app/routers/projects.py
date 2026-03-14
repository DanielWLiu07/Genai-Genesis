from fastapi import APIRouter, HTTPException
from app.models.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.db import get_supabase
import uuid
from datetime import datetime

router = APIRouter(prefix="/projects", tags=["projects"])

@router.post("", response_model=ProjectResponse)
async def create_project(data: ProjectCreate):
    db = get_supabase()
    if db is None:
        # Return mock data if no DB configured
        now = datetime.now().isoformat()
        return ProjectResponse(
            id=str(uuid.uuid4()), title=data.title, author=data.author,
            description=data.description, status="uploading", created_at=now, updated_at=now,
        )
    result = db.table("projects").insert({
        "title": data.title, "description": data.description, "author": data.author,
    }).execute()
    return result.data[0]

@router.get("")
async def list_projects():
    db = get_supabase()
    if db is None:
        return []
    result = db.table("projects").select("*").order("created_at", desc=True).execute()
    return result.data

@router.get("/{project_id}")
async def get_project(project_id: str):
    db = get_supabase()
    if db is None:
        raise HTTPException(status_code=404, detail="Project not found")
    result = db.table("projects").select("*").eq("id", project_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return result.data[0]

@router.patch("/{project_id}")
async def update_project(project_id: str, data: ProjectUpdate):
    db = get_supabase()
    if db is None:
        raise HTTPException(status_code=404, detail="DB not configured")
    updates = data.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now().isoformat()
    result = db.table("projects").update(updates).eq("id", project_id).execute()
    return result.data[0] if result.data else {}

@router.delete("/{project_id}")
async def delete_project(project_id: str):
    db = get_supabase()
    if db is None:
        return {"deleted": True}
    db.table("projects").delete().eq("id", project_id).execute()
    return {"deleted": True}
