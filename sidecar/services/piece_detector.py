"""
LEGO piece detector.
Alpha: uses OpenAI Vision description if API key is present.
Future: YOLOv8 model trained on LEGO parts.
"""
import json
from sidecar.config import get_settings
from sidecar.services.vision import decode_b64_image, resize_for_api, image_to_b64_jpeg
from sidecar.models.piece_id import PieceIdResponse, DetectedPiece


async def detect_pieces(image_b64: str) -> PieceIdResponse:
    settings = get_settings()

    if settings.openai_api_key:
        return await _detect_openai(image_b64, settings.openai_api_key)

    return PieceIdResponse(
        pieces=[],
        model_used="stub",
        error="No OpenAI API key configured. Add it in Settings to enable piece identification.",
    )


async def _detect_openai(image_b64: str, api_key: str) -> PieceIdResponse:
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)

        img = decode_b64_image(image_b64)
        img = resize_for_api(img, 1024)
        resized_b64 = image_to_b64_jpeg(img)

        prompt = (
            "Identify all LEGO pieces visible in this image. "
            "For each piece respond with a JSON array of objects with keys: "
            "name (string), part_number (string or null), color (string), confidence (0-1). "
            "ONLY respond with the raw JSON array."
        )

        resp = await client.chat.completions.create(
            model="gpt-4o",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{resized_b64}"}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )

        content = resp.choices[0].message.content or "[]"
        items = json.loads(content.strip())

        pieces = [
            DetectedPiece(
                name=item.get("name", "Unknown part"),
                part_number=item.get("part_number"),
                color=item.get("color"),
                confidence=float(item.get("confidence", 0.7)),
                bricklink_url=f"https://www.bricklink.com/v2/catalog/catalogitem.page?P={item['part_number']}"
                              if item.get("part_number") else None,
            )
            for item in items if isinstance(item, dict)
        ]
        return PieceIdResponse(pieces=pieces, model_used="gpt-4o")

    except Exception as exc:
        return PieceIdResponse(pieces=[], model_used="gpt-4o", error=str(exc))
