from pydantic import BaseModel
from typing import Optional


class LookupRequest(BaseModel):
    image_b64: str


class LookupMatch(BaseModel):
    type: str  # "set" | "minifigure"
    name: str
    set_number: Optional[str] = None
    fig_number: Optional[str] = None
    year: Optional[int] = None
    theme: Optional[str] = None
    confidence: float
    bricklink_url: Optional[str] = None
    image_url: Optional[str] = None


class LookupResponse(BaseModel):
    matches: list[LookupMatch]
    model_used: str
    error: Optional[str] = None
