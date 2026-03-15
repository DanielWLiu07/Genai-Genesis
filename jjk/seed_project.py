#!/usr/bin/env python3
"""
Seed a JJK project in Supabase from local clips.
- Extracts first frame of each video as thumbnail
- Uploads videos + thumbnails to Supabase storage
- Creates project + timeline with 5 clips in order
"""
import os, subprocess, tempfile, uuid, mimetypes
import requests

SUPABASE_URL = "https://wcyjvftpeckvyxlahgta.supabase.co"
SERVICE_KEY  = "<REDACTED>"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

JJK_DIR = os.path.dirname(os.path.abspath(__file__))
CLIPS = [
    f"Gojo Vs Sukuna {i}.mp4" for i in range(1, 6)
]

def get_duration_ms(path: str) -> int:
    out = subprocess.check_output([
        "ffprobe", "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path
    ]).decode().strip()
    return int(float(out) * 1000)

def extract_first_frame(video_path: str, out_path: str):
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vframes", "1", "-q:v", "2",
        out_path
    ], check=True, capture_output=True)

def upload_file(bucket: str, storage_path: str, file_path: str, content_type: str) -> str:
    """Upload file to Supabase storage, return public URL."""
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}"
    with open(file_path, "rb") as f:
        data = f.read()
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    r = requests.post(url, headers=headers, data=data)
    r.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{storage_path}"

def rest(method: str, path: str, **kwargs):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = requests.request(method, url, headers={**HEADERS, "Prefer": "return=representation"}, **kwargs)
    r.raise_for_status()
    return r.json()

def main():
    project_id = str(uuid.uuid4())
    print(f"Project ID: {project_id}")

    clips_data = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, fname in enumerate(CLIPS):
            video_path = os.path.join(JJK_DIR, fname)
            print(f"\n[{i+1}/5] Processing: {fname}")

            # Duration
            duration_ms = get_duration_ms(video_path)
            print(f"  Duration: {duration_ms}ms")

            # Extract first frame
            thumb_path = os.path.join(tmp, f"thumb_{i+1}.jpg")
            extract_first_frame(video_path, thumb_path)
            print(f"  First frame extracted")

            # Upload video
            vid_storage = f"jjk/{project_id}/clip_{i+1:02d}.mp4"
            print(f"  Uploading video...")
            vid_url = upload_file("videos", vid_storage, video_path, "video/mp4")
            print(f"  Video URL: {vid_url}")

            # Upload thumbnail
            thumb_storage = f"jjk/{project_id}/thumb_{i+1:02d}.jpg"
            print(f"  Uploading thumbnail...")
            thumb_url = upload_file("renders", thumb_storage, thumb_path, "image/jpeg")
            print(f"  Thumbnail URL: {thumb_url}")

            clips_data.append({
                "id": str(uuid.uuid4()),
                "order": i,
                "type": "video",
                "duration_ms": duration_ms,
                "prompt": f"Gojo vs Sukuna — scene {i+1}",
                "generated_media_url": vid_url,
                "thumbnail_url": thumb_url,
                "gen_status": "done",
                "position": {"x": i * 220, "y": 0},
                "shot_type": "cut",
            })

    total_ms = sum(c["duration_ms"] for c in clips_data)
    print(f"\nTotal duration: {total_ms}ms ({total_ms/1000:.1f}s)")

    # Create project
    print("\nCreating project...")
    proj = rest("POST", "projects", json={
        "id": project_id,
        "title": "Jujutsu Kaisen — Gojo vs Sukuna",
        "author": "MangaMate",
        "description": "The legendary clash between Satoru Gojo and Ryomen Sukuna.",
        "status": "ready",
        "content_type": "anime",
    })
    print(f"Project created: {proj[0]['id']}")

    # Create timeline
    print("Creating timeline...")
    tl = rest("POST", "timelines", json={
        "project_id": project_id,
        "clips": clips_data,
        "total_duration_ms": total_ms,
        "settings": {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24},
        "effects": [],
    })
    print(f"Timeline created: {tl[0]['id']}")

    print(f"\n✓ Done! Open: http://localhost:3000/project/{project_id}")

if __name__ == "__main__":
    main()
