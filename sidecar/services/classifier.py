"""
LEGO set/minifigure classifier.
Uses OpenAI GPT-4o Vision if API key is configured, otherwise returns a
descriptive stub so the UI stays functional without the key.
"""
import json
from typing import Optional
from sidecar.config import get_settings
from sidecar.services.vision import decode_b64_image, resize_for_api, image_to_b64_jpeg
from sidecar.models.picture_lookup import LookupResponse, LookupMatch


async def classify_image(image_b64: str, mode: str = "set") -> LookupResponse:
    settings = get_settings()

    if settings.openai_api_key:
        return await _classify_openai(image_b64, settings.openai_api_key, mode)

    return LookupResponse(
        matches=[],
        model_used="stub",
        error="No OpenAI API key configured. Add it in Settings to enable AI identification.",
    )


async def _classify_openai(image_b64: str, api_key: str, mode: str) -> LookupResponse:
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)

        # Resize to save tokens
        img = decode_b64_image(image_b64)
        img = resize_for_api(img, 1024)
        resized_b64 = image_to_b64_jpeg(img)

        prompt = (
            "Identify the LEGO set or minifigure in this image. "
            "Respond ONLY with a JSON object with keys: "
            "type ('set' or 'minifigure'), name, set_number (or fig_number), "
            "year (integer or null), theme (or null), confidence (0.0-1.0). "
            "No markdown, just raw JSON."
        )

        resp = await client.chat.completions.create(
            model="gpt-4o",
            max_tokens=256,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{resized_b64}"}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )

        content = resp.choices[0].message.content or "{}"
        data = json.loads(content.strip())

        match = LookupMatch(
            type=data.get("type", "set"),
            name=data.get("name", "Unknown"),
            set_number=data.get("set_number"),
            fig_number=data.get("fig_number"),
            year=data.get("year"),
            theme=data.get("theme"),
            confidence=float(data.get("confidence", 0.7)),
            bricklink_url=_bricklink_url(data),
        )
        return LookupResponse(matches=[match], model_used="gpt-4o")

    except Exception as exc:
        return LookupResponse(matches=[], model_used="gpt-4o", error=str(exc))


def _bricklink_url(data: dict) -> Optional[str]:
    if data.get("set_number"):
        return f"https://www.bricklink.com/v2/catalog/catalogitem.page?S={data['set_number']}"
    if data.get("fig_number"):
        return f"https://www.bricklink.com/v2/catalog/catalogitem.page?M={data['fig_number']}"
    return None
