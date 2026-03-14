"""Music analysis and suggestion service."""

# Curated royalty-free music suggestions by mood
MUSIC_LIBRARY = [
    {"name": "Epic Cinematic", "mood": "epic", "genre": "orchestral", "duration_ms": 60000, "url": ""},
    {"name": "Dark Mystery", "mood": "dark", "genre": "ambient", "duration_ms": 45000, "url": ""},
    {"name": "Romantic Theme", "mood": "romantic", "genre": "piano", "duration_ms": 50000, "url": ""},
    {"name": "Action Pulse", "mood": "intense", "genre": "electronic", "duration_ms": 40000, "url": ""},
    {"name": "Whimsical Adventure", "mood": "playful", "genre": "orchestral", "duration_ms": 55000, "url": ""},
    {"name": "Horror Tension", "mood": "scary", "genre": "ambient", "duration_ms": 45000, "url": ""},
]

async def suggest_music(mood: str = "", genre: str = "", duration_ms: int = 0) -> list:
    """Suggest background music tracks based on mood and genre."""
    results = MUSIC_LIBRARY
    if mood:
        results = [t for t in results if mood.lower() in t["mood"]] or results
    if genre:
        results = [t for t in results if genre.lower() in t["genre"]] or results
    return results[:3]
