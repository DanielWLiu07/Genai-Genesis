#!/usr/bin/env python3
"""Smoke tests for FrameFlow API service (port 8000)."""

import httpx, sys

BASE_URL = "http://localhost:8000"
GREEN, RED, RESET = "\033[92m", "\033[91m", "\033[0m"
results = []
project_id = None


def run(name, fn):
    global project_id
    try:
        ok, detail = fn()
        tag = f"{GREEN}PASS{RESET}" if ok else f"{RED}FAIL{RESET}"
        print(f"  [{tag}] {name}  {detail}")
        results.append(ok)
    except Exception as e:
        print(f"  [{RED}FAIL{RESET}] {name}  {e}")
        results.append(False)


def test_root():
    r = httpx.get(f"{BASE_URL}/")
    return r.status_code == 200 and r.json().get("service") == "FrameFlow API", f"({r.status_code})"


def test_health():
    r = httpx.get(f"{BASE_URL}/health")
    return r.status_code == 200 and r.json().get("status") == "healthy", f"({r.status_code})"


def test_create_project():
    global project_id
    r = httpx.post(f"{BASE_URL}/api/v1/projects", json={"title": "Test Project", "author": "Smoke Test"})
    if r.status_code == 200:
        project_id = r.json().get("id")
    return r.status_code == 200 and project_id, f"id={project_id}"


def test_list_projects():
    r = httpx.get(f"{BASE_URL}/api/v1/projects")
    data = r.json()
    return r.status_code == 200 and isinstance(data, list), f"count={len(data)}"


def test_get_project():
    r = httpx.get(f"{BASE_URL}/api/v1/projects/{project_id}")
    return r.status_code == 200 and r.json().get("title") == "Test Project", f"({r.status_code})"


def test_get_timeline():
    r = httpx.get(f"{BASE_URL}/api/v1/projects/{project_id}/timeline")
    data = r.json()
    return r.status_code == 200 and "clips" in data, f"clips={len(data.get('clips', []))}"


def test_update_timeline():
    payload = {
        "clips": [{"id": "clip-1", "order": 0, "type": "image", "duration_ms": 3000, "prompt": "A dark forest"}],
        "total_duration_ms": 3000,
        "settings": {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24},
    }
    r = httpx.put(f"{BASE_URL}/api/v1/projects/{project_id}/timeline", json=payload)
    return r.status_code == 200 and len(r.json().get("clips", [])) == 1, f"({r.status_code})"


def test_add_clip():
    clip = {"id": "clip-2", "order": 1, "type": "image", "duration_ms": 2500, "prompt": "A glowing key"}
    r = httpx.post(f"{BASE_URL}/api/v1/projects/{project_id}/clips", json=clip)
    return r.status_code == 200 and r.json().get("id") == "clip-2", f"({r.status_code})"


def test_delete_project():
    r = httpx.delete(f"{BASE_URL}/api/v1/projects/{project_id}")
    return r.status_code == 200 and r.json().get("deleted"), f"({r.status_code})"


if __name__ == "__main__":
    print(f"\nFrameFlow API Smoke Tests ({BASE_URL})\n{'=' * 45}")
    try:
        httpx.get(f"{BASE_URL}/", timeout=3)
    except httpx.ConnectError:
        print(f"  {RED}ERROR: Server not reachable at {BASE_URL}{RESET}")
        sys.exit(1)

    run("GET  /                          ", test_root)
    run("GET  /health                    ", test_health)
    run("POST /api/v1/projects           ", test_create_project)
    run("GET  /api/v1/projects           ", test_list_projects)
    run("GET  /api/v1/projects/{id}      ", test_get_project)
    run("GET  /api/v1/projects/{id}/timeline ", test_get_timeline)
    run("PUT  /api/v1/projects/{id}/timeline ", test_update_timeline)
    run("POST /api/v1/projects/{id}/clips", test_add_clip)
    run("DEL  /api/v1/projects/{id}      ", test_delete_project)

    passed = sum(results)
    total = len(results)
    color = GREEN if passed == total else RED
    print(f"\n{'=' * 45}")
    print(f"  {color}{passed}/{total} passed{RESET}\n")
    sys.exit(0 if passed == total else 1)
