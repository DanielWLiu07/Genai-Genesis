#!/usr/bin/env python3
"""Smoke tests for the FrameFlow Render Service (port 8002)."""

import sys
import httpx

BASE_URL = "http://localhost:8002"
GREEN, RED, YELLOW, RESET = "\033[92m", "\033[91m", "\033[93m", "\033[0m"
results: list[tuple[str, str]] = []  # (name, PASS|FAIL|SKIP)


def log(status: str, name: str, detail: str = ""):
    color = {"PASS": GREEN, "FAIL": RED, "SKIP": YELLOW}[status]
    results.append((name, status))
    print(f"  {color}{status}{RESET}  {name}" + (f" — {detail}" if detail else ""))


def test_health(client: httpx.Client) -> dict:
    name = "GET /health"
    try:
        r = client.get(f"{BASE_URL}/health", timeout=10)
        data = r.json()
        assert r.status_code == 200 and data.get("status") == "healthy"
        log("PASS", name, f"ffmpeg={'yes' if data.get('ffmpeg') else 'no'}")
        return data
    except Exception as e:
        log("FAIL", name, str(e))
        return {}


def test_generate(client: httpx.Client, health: dict):
    name = "POST /render/generate"
    # The endpoint returns a placeholder when no Kling key is set; still valid.
    try:
        r = client.post(
            f"{BASE_URL}/render/generate",
            json={"clip_id": "smoke-test-001", "prompt": "A castle on a hill at sunset", "type": "image"},
            timeout=300,
        )
        data = r.json()
        assert r.status_code == 200 and "clip_id" in data
        log("PASS", name, f"status={data.get('status')}")
    except Exception as e:
        log("FAIL", name, str(e))


def test_music_suggest(client: httpx.Client):
    name = "POST /render/music/suggest"
    try:
        r = client.post(
            f"{BASE_URL}/render/music/suggest",
            json={"mood": "epic", "genre": "fantasy"},
            timeout=10,
        )
        data = r.json()
        tracks = data.get("tracks", [])
        assert r.status_code == 200 and isinstance(tracks, list) and len(tracks) > 0
        log("PASS", name, f"{len(tracks)} track(s) returned")
    except Exception as e:
        log("FAIL", name, str(e))


def test_compose(client: httpx.Client):
    name = "POST /render/compose"
    timeline = {
        "clips": [
            {"id": "c1", "order": 0, "type": "image", "duration_ms": 2000,
             "prompt": "test", "generated_media_url": "", "gen_status": "done",
             "transition_type": "fade", "position": {"x": 0, "y": 0}},
            {"id": "c2", "order": 1, "type": "image", "duration_ms": 2000,
             "prompt": "test2", "generated_media_url": "", "gen_status": "done",
             "transition_type": "cut", "position": {"x": 0, "y": 0}},
        ],
        "settings": {"aspect_ratio": "16:9"},
    }
    try:
        r = client.post(
            f"{BASE_URL}/render/compose",
            json={"project_id": "smoke-test", "timeline": timeline,
                  "include_title_card": False, "include_end_card": False},
            timeout=30,
        )
        data = r.json()
        assert r.status_code == 200 and data.get("job_id")
        log("PASS", name, f"job_id={data['job_id']}, status={data.get('status')}")
    except Exception as e:
        log("FAIL", name, str(e))


def main():
    print(f"\n{'='*50}")
    print(f"  FrameFlow Render Service — Smoke Tests")
    print(f"  {BASE_URL}")
    print(f"{'='*50}\n")

    client = httpx.Client()

    # Connectivity check
    try:
        client.get(f"{BASE_URL}/", timeout=5)
    except httpx.ConnectError:
        print(f"  {RED}FAIL{RESET}  Cannot connect to {BASE_URL}. Is the service running?\n")
        sys.exit(1)

    health = test_health(client)
    test_generate(client, health)
    test_music_suggest(client)
    test_compose(client)

    # Summary
    passed = sum(1 for _, s in results if s == "PASS")
    failed = sum(1 for _, s in results if s == "FAIL")
    skipped = sum(1 for _, s in results if s == "SKIP")
    total = len(results)
    color = GREEN if failed == 0 else RED
    print(f"\n{'='*50}")
    print(f"  {color}{passed}/{total} passed{RESET}  |  {failed} failed  |  {skipped} skipped")
    print(f"{'='*50}\n")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
