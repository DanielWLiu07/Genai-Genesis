"""Tests for media processing utilities."""
import pytest
from PIL import Image
import io
from app.services.media import create_thumbnail, resize_image


def _create_test_image(width: int = 800, height: int = 600, color: str = "red") -> bytes:
    """Create a simple test image in memory and return as bytes."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_create_thumbnail():
    """Test that create_thumbnail produces a smaller image."""
    image_data = _create_test_image(800, 600)
    thumb_data = await create_thumbnail(image_data)

    thumb = Image.open(io.BytesIO(thumb_data))
    assert thumb.width <= 320
    assert thumb.height <= 180


@pytest.mark.asyncio
async def test_create_thumbnail_custom_size():
    """Test create_thumbnail with custom target size."""
    image_data = _create_test_image(1920, 1080)
    thumb_data = await create_thumbnail(image_data, size=(160, 90))

    thumb = Image.open(io.BytesIO(thumb_data))
    assert thumb.width <= 160
    assert thumb.height <= 90


@pytest.mark.asyncio
async def test_create_thumbnail_format():
    """Test that thumbnail is returned as JPEG."""
    image_data = _create_test_image(400, 300)
    thumb_data = await create_thumbnail(image_data)

    thumb = Image.open(io.BytesIO(thumb_data))
    assert thumb.format == "JPEG"


@pytest.mark.asyncio
async def test_resize_image():
    """Test that resize_image produces an image with exact target dimensions."""
    image_data = _create_test_image(800, 600)
    resized_data = await resize_image(image_data, 400, 300)

    resized = Image.open(io.BytesIO(resized_data))
    assert resized.width == 400
    assert resized.height == 300


@pytest.mark.asyncio
async def test_resize_image_upscale():
    """Test resize_image can upscale an image."""
    image_data = _create_test_image(100, 100)
    resized_data = await resize_image(image_data, 500, 500)

    resized = Image.open(io.BytesIO(resized_data))
    assert resized.width == 500
    assert resized.height == 500


@pytest.mark.asyncio
async def test_resize_image_format():
    """Test that resize_image returns PNG format."""
    image_data = _create_test_image(200, 200)
    resized_data = await resize_image(image_data, 100, 100)

    resized = Image.open(io.BytesIO(resized_data))
    assert resized.format == "PNG"


@pytest.mark.asyncio
async def test_create_thumbnail_preserves_aspect_ratio():
    """Test that thumbnail preserves aspect ratio (PIL thumbnail behavior)."""
    image_data = _create_test_image(1600, 900)  # 16:9 aspect ratio
    thumb_data = await create_thumbnail(image_data, size=(320, 180))

    thumb = Image.open(io.BytesIO(thumb_data))
    # PIL thumbnail preserves aspect ratio, so both dimensions should fit within target
    assert thumb.width <= 320
    assert thumb.height <= 180
    # For a 16:9 image into a 16:9 box, it should be exactly 320x180
    assert thumb.width == 320
    assert thumb.height == 180
