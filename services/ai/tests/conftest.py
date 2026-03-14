import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_story_text():
    return (
        "In the ancient kingdom of Eldoria, a young warrior named Kael discovered "
        "a hidden power within himself. The dark sorcerer Malachar had cursed the land, "
        "turning rivers to ash and forests to stone. Kael's mentor, the wise sage Elara, "
        "guided him through treacherous mountains where dragons once roamed. Together they "
        "uncovered the Sunstone, a relic capable of breaking any curse. But Malachar's "
        "shadow army stood between them and salvation. In the final battle atop the Spire "
        "of Storms, Kael sacrificed his power to restore the land, proving that true "
        "strength lies not in magic but in the courage to let it go."
    )


@pytest.fixture
def sample_analysis():
    return {
        "summary": "A young warrior must defeat a dark sorcerer to save his kingdom.",
        "themes": ["courage", "sacrifice", "good vs evil"],
        "genre": "fantasy",
        "sub_genres": ["epic fantasy", "adventure"],
        "mood": "epic and hopeful",
        "target_audience": "young adult fantasy readers",
        "style": "book",
        "characters": [
            {
                "name": "Kael",
                "role": "protagonist",
                "description": "A young warrior who discovers hidden power",
                "visual_description": "Young man with silver armor, glowing blue eyes",
            },
            {
                "name": "Malachar",
                "role": "antagonist",
                "description": "A dark sorcerer who cursed the land",
                "visual_description": "Tall shadowy figure with a staff of black crystal",
            },
        ],
        "key_scenes": [
            {
                "title": "The Discovery",
                "description": "Kael discovers his hidden power",
                "quote": None,
                "mood": "wonder",
                "visual_description": "Close-up of a young warrior's hands glowing with blue light",
                "scene_type": "character_reveal",
                "importance": 8,
            },
            {
                "title": "The Final Battle",
                "description": "Kael faces Malachar atop the Spire of Storms",
                "quote": "True strength lies not in magic",
                "mood": "intense",
                "visual_description": "Wide shot of two figures clashing on a stormy mountain peak",
                "scene_type": "climax",
                "importance": 10,
            },
        ],
    }


@pytest.fixture
def sample_timeline():
    return {
        "clips": [
            {
                "id": "clip-001",
                "order": 0,
                "type": "text_overlay",
                "duration_ms": 3000,
                "prompt": "Dark background with golden text emerging from shadows",
                "text": "In a world of darkness...",
                "transition_type": "fade",
                "gen_status": "pending",
                "position": {"x": 0, "y": 100},
            },
            {
                "id": "clip-002",
                "order": 1,
                "type": "image",
                "duration_ms": 4000,
                "prompt": "Wide establishing shot of a fantasy kingdom at golden hour",
                "text": None,
                "transition_type": "dissolve",
                "gen_status": "pending",
                "position": {"x": 280, "y": 100},
            },
            {
                "id": "clip-003",
                "order": 2,
                "type": "image",
                "duration_ms": 3000,
                "prompt": "Close-up of warrior drawing a glowing sword, dramatic lighting",
                "text": None,
                "transition_type": "cut",
                "gen_status": "pending",
                "position": {"x": 560, "y": 100},
            },
        ],
        "trailer_style": "fantasy",
        "total_duration_ms": 10000,
        "music_mood": "epic",
    }


@pytest.fixture
def sample_clips():
    return [
        {
            "id": "test-clip-1",
            "order": 0,
            "type": "image",
            "duration_ms": 3000,
            "prompt": "A sweeping aerial shot of a dark castle",
            "text": None,
            "transition_type": "dissolve",
            "gen_status": "pending",
            "position": {"x": 0, "y": 100},
        },
        {
            "id": "test-clip-2",
            "order": 1,
            "type": "image",
            "duration_ms": 4000,
            "prompt": "Close-up of a warrior gripping a sword",
            "text": None,
            "transition_type": "cut",
            "gen_status": "pending",
            "position": {"x": 280, "y": 100},
        },
    ]
