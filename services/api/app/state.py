# Shared in-memory state for hackathon (lost on restart — Supabase is authoritative when available)
import uuid
from datetime import datetime

_book_texts: dict[str, str] = {}  # project_id -> extracted text
_projects: dict[str, dict] = {}   # project_id -> project dict (fallback when no DB)
_timelines: dict[str, dict] = {}  # project_id -> timeline dict


# ---------- book text ----------
def store_book_text(project_id: str, text: str) -> None:
    _book_texts[project_id] = text


def get_book_text(project_id: str) -> str:
    return _book_texts.get(project_id, "")


# ---------- projects (in-memory fallback) ----------
def _now() -> str:
    return datetime.now().isoformat()


def create_project_mem(title: str, author: str, description: str) -> dict:
    pid = str(uuid.uuid4())
    p = {"id": pid, "title": title, "author": author, "description": description,
         "status": "uploading", "analysis": None, "book_file_url": None,
         "cover_image_url": None, "audio_file_url": None, "audio_analysis": None,
         "created_at": _now(), "updated_at": _now()}
    _projects[pid] = p
    return p


def get_project_mem(pid: str) -> dict | None:
    return _projects.get(pid)


def list_projects_mem() -> list[dict]:
    return sorted(_projects.values(), key=lambda p: p["created_at"], reverse=True)


def update_project_mem(pid: str, **kwargs) -> dict | None:
    p = _projects.get(pid)
    if p is None:
        return None
    p.update(kwargs)
    p["updated_at"] = _now()
    return p


def delete_project_mem(pid: str) -> None:
    _projects.pop(pid, None)
    _timelines.pop(pid, None)


# ---------- timelines (in-memory fallback) ----------
def _default_timeline(project_id: str) -> dict:
    return {"project_id": project_id, "clips": [], "music_track": None,
            "total_duration_ms": 0, "effects": [], "beat_map": None,
            "settings": {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24}}


def get_timeline_mem(project_id: str) -> dict:
    return _timelines.get(project_id, _default_timeline(project_id))


def upsert_timeline_mem(project_id: str, **kwargs) -> dict:
    tl = _timelines.setdefault(project_id, _default_timeline(project_id))
    tl.update(kwargs)
    return tl
