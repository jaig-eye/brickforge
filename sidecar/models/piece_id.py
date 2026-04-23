from pydantic import BaseModel
from typing import Optional


class PieceIdRequest(BaseModel):
    image_b64: str


class DetectedPiece(BaseModel):
    part_number: Optional[str] = None
    name: str
    color: Optional[str] = None
    color_id: Optional[int] = None
    confidence: float
    bricklink_url: Optional[str] = None
    bbox: Optional[list[float]] = None  # [x1, y1, x2, y2] normalized


class PieceIdResponse(BaseModel):
    pieces: list[DetectedPiece]
    model_used: str
    error: Optional[str] = None
