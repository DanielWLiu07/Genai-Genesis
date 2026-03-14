"""Tests for the music suggestion service."""
import pytest
from app.services.music import suggest_music


@pytest.mark.asyncio
async def test_suggest_music_returns_list():
    """Test that suggest_music returns a list."""
    results = await suggest_music()
    assert isinstance(results, list)
    assert len(results) > 0


@pytest.mark.asyncio
async def test_suggest_music_max_three():
    """Test that suggest_music returns at most 3 tracks."""
    results = await suggest_music()
    assert len(results) <= 3


@pytest.mark.asyncio
async def test_suggest_music_by_mood():
    """Test filtering by mood returns matching tracks."""
    results = await suggest_music(mood="epic")
    assert len(results) > 0
    assert results[0]["mood"] == "epic"


@pytest.mark.asyncio
async def test_suggest_music_by_genre():
    """Test filtering by genre returns matching tracks."""
    results = await suggest_music(genre="piano")
    assert len(results) > 0
    assert results[0]["genre"] == "piano"


@pytest.mark.asyncio
async def test_suggest_music_by_mood_and_genre():
    """Test filtering by both mood and genre."""
    results = await suggest_music(mood="epic", genre="orchestral")
    assert len(results) > 0
    assert results[0]["mood"] == "epic"
    assert results[0]["genre"] == "orchestral"


@pytest.mark.asyncio
async def test_suggest_music_no_match_falls_back():
    """Test that a non-matching mood/genre still returns results (fallback)."""
    results = await suggest_music(mood="nonexistent_mood")
    assert len(results) > 0


@pytest.mark.asyncio
async def test_suggest_music_no_match_genre_falls_back():
    """Test that a non-matching genre still returns results (fallback)."""
    results = await suggest_music(genre="nonexistent_genre")
    assert len(results) > 0


@pytest.mark.asyncio
async def test_suggest_music_track_structure():
    """Test that each track has the expected keys."""
    results = await suggest_music()
    for track in results:
        assert "name" in track
        assert "mood" in track
        assert "genre" in track
        assert "duration_ms" in track
        assert "url" in track
