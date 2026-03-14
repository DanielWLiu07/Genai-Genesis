"""Media processing utilities (resize, format conversion, thumbnails, title cards)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import io
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def create_thumbnail(image_data: bytes, size: tuple = (320, 180)) -> bytes:
    """Create a thumbnail from image data."""
    img = Image.open(io.BytesIO(image_data))
    img.thumbnail(size, Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


async def resize_image(image_data: bytes, width: int, height: int) -> bytes:
    """Resize image to specific dimensions."""
    img = Image.open(io.BytesIO(image_data))
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _get_font(size: int) -> ImageFont.FreeTypeFont:
    """Get a font, falling back to default if custom fonts unavailable."""
    font_paths = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSText.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    width: int,
    font: ImageFont.FreeTypeFont,
    fill: str = "white",
    shadow: bool = True,
):
    """Draw horizontally centered text with optional shadow."""
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    x = (width - text_w) // 2

    if shadow:
        draw.text((x + 2, y + 2), text, font=font, fill="#00000099")

    draw.text((x, y), text, font=font, fill=fill)


async def generate_title_card(
    title: str,
    subtitle: str = "",
    width: int = 1920,
    height: int = 1080,
    bg_color: str = "#0a0a0a",
    text_color: str = "white",
    output_path: Optional[str] = None,
) -> bytes:
    """Generate a title card image with gradient background.

    Args:
        title: Main title text
        subtitle: Subtitle (e.g., author name)
        width, height: Dimensions
        bg_color: Background color
        text_color: Text color
        output_path: Optional path to save to disk

    Returns: PNG image data as bytes
    """
    img = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # Draw subtle gradient overlay
    for y in range(height):
        alpha = int(30 * (1 - abs(y - height / 2) / (height / 2)))
        draw.line([(0, y), (width, y)], fill=(alpha, alpha, alpha + 10))

    # Draw decorative line
    line_y = height // 2 - 20
    line_w = width // 4
    draw.line(
        [(width // 2 - line_w, line_y), (width // 2 + line_w, line_y)],
        fill="#ffffff44",
        width=1,
    )

    # Title text
    title_font = _get_font(int(height * 0.08))
    title_y = int(height * 0.35)
    _draw_centered_text(draw, title, title_y, width, title_font, text_color)

    # Subtitle
    if subtitle:
        sub_font = _get_font(int(height * 0.04))
        sub_y = int(height * 0.55)
        _draw_centered_text(draw, subtitle, sub_y, width, sub_font, "#cccccc")

    # Bottom decorative line
    line_y2 = int(height * 0.65)
    draw.line(
        [(width // 2 - line_w, line_y2), (width // 2 + line_w, line_y2)],
        fill="#ffffff44",
        width=1,
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()

    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(data)

    return data


async def generate_end_card(
    title: str = "Created with FrameFlow",
    subtitle: str = "AI Book Trailer Generator",
    width: int = 1920,
    height: int = 1080,
    output_path: Optional[str] = None,
) -> bytes:
    """Generate an end card / credits image.

    Returns: PNG image data as bytes
    """
    img = Image.new("RGB", (width, height), "#050510")
    draw = ImageDraw.Draw(img)

    # Subtle radial-ish gradient
    for y in range(height):
        for x in range(0, width, 4):
            dist = ((x - width / 2) ** 2 + (y - height / 2) ** 2) ** 0.5
            max_dist = (width ** 2 + height ** 2) ** 0.5 / 2
            alpha = max(0, int(15 * (1 - dist / max_dist)))
            if alpha > 0:
                draw.point((x, y), fill=(alpha, alpha, alpha + 5))

    title_font = _get_font(int(height * 0.06))
    sub_font = _get_font(int(height * 0.03))

    _draw_centered_text(draw, title, int(height * 0.4), width, title_font, "white")
    _draw_centered_text(draw, subtitle, int(height * 0.55), width, sub_font, "#888888")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()

    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(data)

    return data


async def image_to_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
    """Convert PIL Image to bytes."""
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()
