"""Shared image preprocessing utilities."""
import base64
from io import BytesIO
from PIL import Image


def decode_b64_image(b64_string: str) -> Image.Image:
    """Decode a base64-encoded image string to a PIL Image."""
    data = base64.b64decode(b64_string)
    return Image.open(BytesIO(data)).convert("RGB")


def resize_for_api(image: Image.Image, max_dim: int = 1024) -> Image.Image:
    """Resize image so longest dimension <= max_dim, preserving aspect ratio."""
    w, h = image.size
    if max(w, h) <= max_dim:
        return image
    scale = max_dim / max(w, h)
    return image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)


def image_to_b64_jpeg(image: Image.Image, quality: int = 85) -> str:
    """Convert PIL Image to base64 JPEG string."""
    buf = BytesIO()
    image.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()
