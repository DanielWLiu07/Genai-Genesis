#!/usr/bin/env python3
"""
Supabase migration script — copies all data and storage from OLD project to NEW project.

Usage:
    pip install supabase requests

    OLD_URL=https://xxx.supabase.co \
    OLD_KEY=eyJ... \
    NEW_URL=https://yyy.supabase.co \
    NEW_KEY=eyJ... \
    python scripts/migrate_supabase.py
"""
import os
import sys
import uuid
import requests
import tempfile
import mimetypes
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

OLD_URL = os.environ["OLD_URL"].rstrip("/")
OLD_KEY = os.environ["OLD_KEY"]
NEW_URL = os.environ["NEW_URL"].rstrip("/")
NEW_KEY = os.environ["NEW_KEY"]

BUCKETS = ["videos", "images", "audio", "books", "covers", "thumbnails", "renders"]

# ── Helpers ───────────────────────────────────────────────────────────────────

def old_headers():
    return {"apikey": OLD_KEY, "Authorization": f"Bearer {OLD_KEY}", "Content-Type": "application/json"}

def new_headers():
    return {"apikey": NEW_KEY, "Authorization": f"Bearer {NEW_KEY}", "Content-Type": "application/json"}

def old_get(path, params=None):
    r = requests.get(f"{OLD_URL}/rest/v1/{path}", headers=old_headers(), params=params)
    r.raise_for_status()
    return r.json()

def new_post(path, data):
    r = requests.post(f"{NEW_URL}/rest/v1/{path}", headers={**new_headers(), "Prefer": "return=representation"}, json=data)
    r.raise_for_status()
    return r.json()

def new_upsert(path, data):
    h = {**new_headers(), "Prefer": "resolution=merge-duplicates,return=representation"}
    r = requests.post(f"{NEW_URL}/rest/v1/{path}", headers=h, json=data)
    r.raise_for_status()
    return r.json()

def log(msg):
    print(f"  {msg}", flush=True)

# ── Storage migration ─────────────────────────────────────────────────────────

def ensure_bucket(bucket_name):
    """Create bucket in new project if it doesn't exist."""
    r = requests.post(
        f"{NEW_URL}/storage/v1/bucket",
        headers=new_headers(),
        json={"id": bucket_name, "name": bucket_name, "public": True},
    )
    if r.status_code in (200, 201):
        log(f"Created bucket: {bucket_name}")
    elif r.status_code == 409:
        log(f"Bucket already exists: {bucket_name}")
    else:
        log(f"Warning: could not create bucket {bucket_name}: {r.text}")

def list_bucket_files(bucket_name):
    """List all files in a storage bucket."""
    r = requests.post(
        f"{OLD_URL}/storage/v1/object/list/{bucket_name}",
        headers=old_headers(),
        json={"prefix": "", "limit": 10000, "offset": 0},
    )
    if r.status_code == 400 and "not found" in r.text.lower():
        return []
    r.raise_for_status()
    items = r.json()
    return [item["name"] for item in items if item.get("name")]

def copy_file(bucket_name, file_path):
    """Download from old, upload to new. Returns new public URL."""
    old_pub_url = f"{OLD_URL}/storage/v1/object/public/{bucket_name}/{file_path}"
    r = requests.get(old_pub_url, timeout=120)
    if r.status_code != 200:
        log(f"  ✗ Could not download {bucket_name}/{file_path} ({r.status_code})")
        return None

    content_type = r.headers.get("content-type", "application/octet-stream").split(";")[0]
    upload_headers = {
        "apikey": NEW_KEY,
        "Authorization": f"Bearer {NEW_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    up = requests.post(
        f"{NEW_URL}/storage/v1/object/{bucket_name}/{file_path}",
        headers=upload_headers,
        data=r.content,
        timeout=120,
    )
    if up.status_code in (200, 201):
        return f"{NEW_URL}/storage/v1/object/public/{bucket_name}/{file_path}"
    else:
        log(f"  ✗ Upload failed for {bucket_name}/{file_path}: {up.text}")
        return None

def migrate_storage():
    print("\n── Storage ──────────────────────────────────────────────────────")
    url_map = {}  # old_url -> new_url

    for bucket in BUCKETS:
        ensure_bucket(bucket)
        files = list_bucket_files(bucket)
        if not files:
            log(f"{bucket}: empty / not found, skipping")
            continue
        log(f"{bucket}: {len(files)} files")
        for f in files:
            old_url = f"{OLD_URL}/storage/v1/object/public/{bucket}/{f}"
            new_url = copy_file(bucket, f)
            if new_url:
                url_map[old_url] = new_url
                log(f"  ✓ {bucket}/{f}")

    return url_map

# ── URL rewriting ─────────────────────────────────────────────────────────────

def rewrite_urls(obj, url_map):
    """Recursively replace old storage URLs with new ones in any dict/list/str."""
    if isinstance(obj, str):
        for old, new in url_map.items():
            obj = obj.replace(old, new)
        return obj
    elif isinstance(obj, dict):
        return {k: rewrite_urls(v, url_map) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [rewrite_urls(i, url_map) for i in obj]
    return obj

# ── Table migration ───────────────────────────────────────────────────────────

def migrate_projects(url_map):
    print("\n── projects ─────────────────────────────────────────────────────")
    rows = old_get("projects", {"select": "*", "order": "created_at.asc", "limit": "1000"})
    log(f"Found {len(rows)} projects")
    for row in rows:
        row = rewrite_urls(row, url_map)
        new_upsert("projects", row)
        log(f"  ✓ {row['id']} — {row.get('title', '?')}")
    return [r["id"] for r in rows]

def migrate_timelines(url_map):
    print("\n── timelines ────────────────────────────────────────────────────")
    rows = old_get("timelines", {"select": "*", "order": "created_at.asc", "limit": "1000"})
    log(f"Found {len(rows)} timelines")
    for row in rows:
        row = rewrite_urls(row, url_map)
        new_upsert("timelines", row)
        log(f"  ✓ {row['id']}")

def migrate_render_jobs(url_map):
    print("\n── render_jobs ──────────────────────────────────────────────────")
    rows = old_get("render_jobs", {"select": "*", "order": "created_at.asc", "limit": "1000"})
    log(f"Found {len(rows)} render jobs")
    for row in rows:
        row = rewrite_urls(row, url_map)
        new_upsert("render_jobs", row)
        log(f"  ✓ {row['id']} ({row.get('status')})")

def migrate_chat_history(url_map):
    print("\n── chat_history ─────────────────────────────────────────────────")
    rows = old_get("chat_history", {"select": "*", "order": "updated_at.asc", "limit": "1000"})
    log(f"Found {len(rows)} chat histories")
    for row in rows:
        row = rewrite_urls(row, url_map)
        new_upsert("chat_history", row)
        log(f"  ✓ {row['id']}")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("Supabase Migration")
    print(f"  OLD: {OLD_URL}")
    print(f"  NEW: {NEW_URL}")

    # 1. Migrate storage first so we have the URL map
    url_map = migrate_storage()
    print(f"\n  {len(url_map)} file URLs remapped")

    # 2. Migrate tables (projects first due to FK constraints)
    migrate_projects(url_map)
    migrate_timelines(url_map)
    migrate_render_jobs(url_map)
    migrate_chat_history(url_map)

    print("\n✓ Migration complete")
    print("\nNext steps:")
    print("  1. Run schema.sql on your new project (SQL editor in Supabase dashboard)")
    print("  2. Update OLD_URL and OLD_KEY in your .env to the new values")
    print("  3. Restart all services")

if __name__ == "__main__":
    main()
