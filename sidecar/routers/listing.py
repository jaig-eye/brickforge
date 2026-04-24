"""eBay listing generation endpoints — multi-provider AI (OpenAI / Anthropic)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/listing", tags=["listing"])


class IdentifyRequest(BaseModel):
    image_b64: str
    media_type: str = "image/jpeg"
    api_key: str
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    theme_hint: str = ""
    context_hint: str = ""


class SetData(BaseModel):
    set_number: str
    name: str
    year: int | None = None
    theme: str | None = None
    piece_count: int | None = None
    num_parts: int | None = None
    num_minifigures: int | None = None
    minifig_count: int | None = None


class ListingPrefs(BaseModel):
    smoke_free_home: bool = False
    clean_set: bool = False
    includes_instructions: bool = True
    includes_figures: bool = True
    completeness: str = "complete"  # "complete" | "partial" | "incomplete"


class GenerateRequest(BaseModel):
    set_data: SetData
    prefs: ListingPrefs
    api_key: str
    provider: str = "openai"
    model: str = "gpt-4o-mini"


@router.post("/identify")
async def identify_set(req: IdentifyRequest):
    if not req.api_key:
        raise HTTPException(400, "API key is required")
    try:
        from sidecar.services.claude_ai import identify_lego_set
        return identify_lego_set(req.image_b64, req.media_type, req.api_key,
                                  provider=req.provider, model=req.model,
                                  theme_hint=req.theme_hint, context_hint=req.context_hint)
    except Exception as exc:
        logger.error("[listing:identify] %s", exc)
        raise HTTPException(500, str(exc))


@router.post("/generate")
async def generate_listing(req: GenerateRequest):
    if not req.api_key:
        raise HTTPException(400, "API key is required")
    try:
        from sidecar.services.claude_ai import generate_ebay_listing
        return generate_ebay_listing(req.set_data.model_dump(), req.prefs.model_dump(),
                                      req.api_key, provider=req.provider, model=req.model)
    except Exception as exc:
        logger.error("[listing:generate] %s", exc)
        raise HTTPException(500, str(exc))
