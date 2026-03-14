#!/usr/bin/env python3
"""Smoke tests for FrameFlow AI service (port 8001)."""

import httpx, os, sys, time

BASE_URL = "http://localhost:8001"
TIMEOUT = 120.0
GREEN, RED, YELLOW, RESET = "\033[92m", "\033[91m", "\033[93m", "\033[0m"
results: list[tuple[str, str]] = []  # (name, "pass"|"fail"|"skip")

TEST_STORY = (
    "Once upon a time, in a kingdom shrouded by eternal mist, there lived a young "
    "blacksmith named Elara who could hear the whispers of iron. Every blade she forged "
    "sang a different song — some joyful, others mournful. The kingdom's tyrant, Lord "
    "Ashvane, feared her gift, for prophecy held that a singing blade would end his "
    "reign. He sent his Shadow Knights to destroy her forge, but Elara fled into the "
    "Whispering Woods with nothing but a half-finished sword. There she met Kael, a "
    "blind archer exiled for refusing to fight in Ashvane's wars. Together they forged "
    "the Songblade in a clearing where moonlight pooled like silver. When the Shadow "
    "Knights found them, Elara struck the blade against stone and it sang a note so "
    "pure that the knights' dark armor crumbled to ash. She marched to Lord Ashvane's "
    "fortress, the sword humming louder with each step. In the throne room, she did not "
    "fight — she played the blade like a violin, and its song broke every chain in the "
    "kingdom. Ashvane, stripped of his power, wept. The mist lifted for the first time "
    "in a hundred years, and sunlight poured over the land."
)

MOCK_ANALYSIS = {
    "characters": [
        {"name": "Elara", "role": "protagonist", "description": "A blacksmith who hears iron whisper"},
        {"name": "Lord Ashvane", "role": "antagonist", "description": "A tyrant who fears prophecy"},
    ],
    "themes": ["freedom", "courage", "power of art"],
    "key_scenes": [
        {"description": "Elara forges the Songblade in moonlit clearing", "mood": "mystical"},
        {"description": "Shadow Knights crumble before the blade's song", "mood": "triumphant"},
        {"description": "Elara plays the blade in the throne room, breaking chains", "mood": "cathartic"},
    ],
    "mood_arc": ["mysterious", "tense", "triumphant"],
}

MOCK_TIMELINE = {
    "clips": [
        {"id": "c1", "order": 0, "type": "image", "prompt": "Misty kingdom wide shot", "duration_ms": 3000},
        {"id": "c2", "order": 1, "type": "image", "prompt": "Elara at her forge", "duration_ms": 4000},
        {"id": "c3", "order": 2, "type": "image", "prompt": "Songblade glowing", "duration_ms": 3000},
    ]
}


def record(name: str, status: str, detail: str = ""):
    sym = {"pass": f"{GREEN}PASS{RESET}", "fail": f"{RED}FAIL{RESET}", "skip": f"{YELLOW}SKIP{RESET}"}
    print(f"  {sym[status]}  {name}" + (f"  ({detail})" if detail else ""))
    results.append((name, status))


def test_health(client: httpx.Client):
    r = client.get("/health", timeout=10)
    assert r.status_code == 200, f"status {r.status_code}"
    body = r.json()
    assert "gemini_configured" in body, "missing gemini_configured"
    record("GET /health", "pass", f"gemini_configured={body['gemini_configured']}")
    return body["gemini_configured"]


def test_analyze(client: httpx.Client):
    t0 = time.time()
    r = client.post("/ai/analyze", json={"project_id": "smoke", "book_text": TEST_STORY}, timeout=TIMEOUT)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"status {r.status_code}: {r.text[:200]}"
    body = r.json()
    for key in ("characters", "themes", "key_scenes"):
        assert key in body, f"missing '{key}'"
    record("POST /ai/analyze", "pass", f"{elapsed:.1f}s, {len(body['characters'])} chars, {len(body['key_scenes'])} scenes")


def test_plan(client: httpx.Client):
    t0 = time.time()
    r = client.post("/ai/plan-trailer", json={"project_id": "smoke", "analysis": MOCK_ANALYSIS}, timeout=TIMEOUT)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"status {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert "clips" in body, "missing 'clips'"
    assert len(body["clips"]) > 0, "empty clips array"
    record("POST /ai/plan-trailer", "pass", f"{elapsed:.1f}s, {len(body['clips'])} clips")


def test_chat(client: httpx.Client):
    t0 = time.time()
    r = client.post("/ai/chat", json={
        "project_id": "smoke", "message": "Add a dramatic opening scene",
        "timeline": MOCK_TIMELINE, "history": [],
    }, timeout=TIMEOUT)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"status {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert "content" in body, "missing 'content'"
    record("POST /ai/chat", "pass", f"{elapsed:.1f}s, tool_calls={len(body.get('tool_calls', []))}")


def test_suggest(client: httpx.Client):
    t0 = time.time()
    r = client.post("/ai/suggest", json={
        "project_id": "smoke", "timeline": MOCK_TIMELINE, "analysis": MOCK_ANALYSIS,
    }, timeout=TIMEOUT)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"status {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert "suggestions" in body, "missing 'suggestions'"
    record("POST /ai/suggest", "pass", f"{elapsed:.1f}s, {len(body['suggestions'])} suggestions")


def main():
    print(f"\n{'='*50}")
    print(f"  FrameFlow AI Service Smoke Tests")
    print(f"  {BASE_URL}")
    print(f"{'='*50}\n")

    client = httpx.Client(base_url=BASE_URL)

    # 1 - health (always runs)
    try:
        gemini_ok = test_health(client)
    except Exception as e:
        record("GET /health", "fail", str(e))
        print(f"\n{RED}Server not reachable — aborting.{RESET}\n")
        sys.exit(1)

    # 2-5 - Gemini-dependent tests
    gemini_tests = [
        ("POST /ai/analyze", test_analyze),
        ("POST /ai/plan-trailer", test_plan),
        ("POST /ai/chat", test_chat),
        ("POST /ai/suggest", test_suggest),
    ]

    if not gemini_ok:
        for name, _ in gemini_tests:
            record(name, "skip", "GEMINI_API_KEY not set")
    else:
        for name, fn in gemini_tests:
            try:
                fn(client)
            except Exception as e:
                record(name, "fail", str(e)[:120])

    # Summary
    passed = sum(1 for _, s in results if s == "pass")
    failed = sum(1 for _, s in results if s == "fail")
    skipped = sum(1 for _, s in results if s == "skip")
    print(f"\n{'='*50}")
    color = GREEN if failed == 0 else RED
    print(f"  {color}{passed} passed, {failed} failed, {skipped} skipped{RESET}")
    print(f"{'='*50}\n")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
