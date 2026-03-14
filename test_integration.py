#!/usr/bin/env python3
"""FrameFlow integration smoke test - tests the full demo flow through all services."""

import httpx
import time
import sys
import io

BASE_URL = "http://localhost:8000"
AI_URL = "http://localhost:8001"
RENDER_URL = "http://localhost:8002"

FAIRY_TALE = """\
Once upon a time, in a kingdom nestled between two great mountains, there lived a young \
woodcutter named Elara. Every morning she ventured into the Whispering Forest, where the \
trees spoke in rustling riddles. One fateful dawn, she discovered a silver fox trapped \
beneath a fallen oak. With great effort, she freed the creature. The fox spoke: "You have \
shown kindness where others showed fear. I shall grant you one wish."

Elara thought carefully. "I wish for the courage to face what lies beyond the mountains." \
The fox smiled and vanished in a swirl of starlight. That night, a terrible storm shook \
the kingdom. The river flooded, threatening the village. But Elara, filled with newfound \
courage, rallied the villagers. Together they built a dam of stones and timber.

When dawn broke, the village stood safe. The fox appeared once more atop the ridge. \
"Courage was always within you," it said. "I merely helped you see it." And from that \
day forward, Elara was known not as a woodcutter, but as the Guardian of the Valley.
"""

# Colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

results: list[tuple[str, str, str]] = []  # (name, status, detail)
ai_up = False


def log(step: str, status: str, detail: str = ""):
    color = {"PASS": GREEN, "FAIL": RED, "SKIP": YELLOW}[status]
    icon = {"PASS": "OK", "FAIL": "FAIL", "SKIP": "SKIP"}[status]
    print(f"  {color}[{icon}]{RESET} {step}" + (f" - {detail}" if detail else ""))
    results.append((step, status, detail))


def main():
    global ai_up
    start = time.time()
    project_id = None

    print(f"\n{BOLD}{CYAN}=== FrameFlow Integration Smoke Test ==={RESET}\n")

    # ── 1. Health checks ──────────────────────────────────────────────
    print(f"{BOLD}1. Health Checks{RESET}")
    services = [("API Gateway", BASE_URL), ("AI Service", AI_URL), ("Render Service", RENDER_URL)]
    api_up = False
    for name, url in services:
        try:
            r = httpx.get(f"{url}/health", timeout=5)
            if r.status_code == 200:
                log(f"{name} health", "PASS", f"{url}/health -> 200")
                if "API" in name:
                    api_up = True
                if "AI" in name:
                    ai_up = True
            else:
                log(f"{name} health", "FAIL", f"status {r.status_code}")
        except httpx.ConnectError:
            log(f"{name} health", "FAIL", "connection refused")

    if not api_up:
        print(f"\n  {RED}API Gateway is down - aborting.{RESET}\n")
        print_summary(start)
        sys.exit(1)

    # ── 2. Create project ─────────────────────────────────────────────
    print(f"\n{BOLD}2. Create Project{RESET}")
    try:
        r = httpx.post(f"{BASE_URL}/api/v1/projects", json={"title": "Integration Test"})
        if r.status_code == 200 and r.json().get("id"):
            project_id = r.json()["id"]
            log("Create project", "PASS", f"id={project_id[:12]}...")
        else:
            log("Create project", "FAIL", f"status {r.status_code}")
    except Exception as e:
        log("Create project", "FAIL", str(e))

    if not project_id:
        print(f"\n  {RED}No project created - aborting.{RESET}\n")
        print_summary(start)
        sys.exit(1)

    # ── 3. Upload book ─────────────────────────────────────────────────
    print(f"\n{BOLD}3. Upload Book{RESET}")
    book_text = None
    try:
        files = {"file": ("fairy_tale.txt", io.BytesIO(FAIRY_TALE.encode()), "text/plain")}
        r = httpx.post(f"{BASE_URL}/api/v1/projects/{project_id}/upload", files=files)
        data = r.json()
        if r.status_code == 200 and data.get("book_text"):
            book_text = data["book_text"]
            log("Upload book", "PASS", f"{data.get('size', '?')} bytes, text returned")
        else:
            log("Upload book", "FAIL", f"status {r.status_code}: {data}")
    except Exception as e:
        log("Upload book", "FAIL", str(e))

    # ── 4. Analyze story ───────────────────────────────────────────────
    print(f"\n{BOLD}4. Analyze Story{RESET}")
    analysis = None
    if not ai_up:
        log("Analyze story", "SKIP", "AI service is down")
    elif not book_text:
        log("Analyze story", "SKIP", "no book_text from upload")
    else:
        try:
            r = httpx.post(
                f"{BASE_URL}/api/v1/projects/{project_id}/analyze",
                json={"book_text": book_text},
                timeout=120,
            )
            data = r.json()
            if r.status_code == 200 and data.get("key_scenes"):
                analysis = data
                log("Analyze story", "PASS", f"{len(data['key_scenes'])} key scenes found")
            else:
                log("Analyze story", "FAIL", f"status {r.status_code}: {str(data)[:120]}")
        except Exception as e:
            log("Analyze story", "FAIL", str(e))

    # ── 5. Plan trailer ───────────────────────────────────────────────
    print(f"\n{BOLD}5. Plan Trailer{RESET}")
    clips = None
    if not ai_up:
        log("Plan trailer", "SKIP", "AI service is down")
    elif not analysis:
        log("Plan trailer", "SKIP", "no analysis from step 4")
    else:
        try:
            r = httpx.post(
                f"{BASE_URL}/api/v1/projects/{project_id}/plan-trailer",
                json={"analysis": analysis},
                timeout=120,
            )
            data = r.json()
            if r.status_code == 200 and data.get("clips"):
                clips = data["clips"]
                log("Plan trailer", "PASS", f"{len(clips)} clips planned")
            else:
                log("Plan trailer", "FAIL", f"status {r.status_code}: {str(data)[:120]}")
        except Exception as e:
            log("Plan trailer", "FAIL", str(e))

    # ── 6. Save timeline ──────────────────────────────────────────────
    print(f"\n{BOLD}6. Save Timeline{RESET}")
    if not clips:
        log("Save timeline", "SKIP", "no clips from step 5")
    else:
        try:
            total_ms = sum(c.get("duration_ms", 3000) for c in clips)
            timeline_payload = {
                "clips": clips,
                "total_duration_ms": total_ms,
                "settings": {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24},
            }
            r = httpx.put(
                f"{BASE_URL}/api/v1/projects/{project_id}/timeline",
                json=timeline_payload,
            )
            if r.status_code == 200:
                log("Save timeline", "PASS", f"{len(clips)} clips, {total_ms}ms total")
            else:
                log("Save timeline", "FAIL", f"status {r.status_code}: {r.text[:120]}")
        except Exception as e:
            log("Save timeline", "FAIL", str(e))

    # ── 7. Chat ────────────────────────────────────────────────────────
    print(f"\n{BOLD}7. Chat with Copilot{RESET}")
    if not ai_up:
        log("Chat", "SKIP", "AI service is down")
    else:
        try:
            chat_payload = {
                "message": "Make the opening more dramatic",
                "timeline": {"clips": clips or [], "total_duration_ms": 0},
                "history": [],
            }
            r = httpx.post(
                f"{BASE_URL}/api/v1/projects/{project_id}/chat",
                json=chat_payload,
                timeout=120,
            )
            data = r.json()
            if r.status_code == 200 and data.get("content"):
                log("Chat", "PASS", f"response: {data['content'][:80]}...")
            else:
                log("Chat", "FAIL", f"status {r.status_code}: {str(data)[:120]}")
        except Exception as e:
            log("Chat", "FAIL", str(e))

    # ── 8. Cleanup ─────────────────────────────────────────────────────
    print(f"\n{BOLD}8. Cleanup{RESET}")
    try:
        r = httpx.delete(f"{BASE_URL}/api/v1/projects/{project_id}")
        if r.status_code == 200 and r.json().get("deleted"):
            log("Delete project", "PASS", f"project {project_id[:12]}... deleted")
        else:
            log("Delete project", "FAIL", f"status {r.status_code}")
    except Exception as e:
        log("Delete project", "FAIL", str(e))

    print_summary(start)


def print_summary(start: float):
    elapsed = time.time() - start
    passed = sum(1 for _, s, _ in results if s == "PASS")
    failed = sum(1 for _, s, _ in results if s == "FAIL")
    skipped = sum(1 for _, s, _ in results if s == "SKIP")

    print(f"\n{BOLD}{CYAN}{'=' * 45}")
    print(f"  SUMMARY")
    print(f"{'=' * 45}{RESET}")
    print(f"  {GREEN}Passed:  {passed}{RESET}")
    print(f"  {RED}Failed:  {failed}{RESET}")
    print(f"  {YELLOW}Skipped: {skipped}{RESET}")
    print(f"  Time:    {elapsed:.1f}s")
    print(f"{CYAN}{'=' * 45}{RESET}\n")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
