"""Media processing utilities (resize, format conversion, thumbnails)."""
from PIL import Image
import io

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
