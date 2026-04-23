from fastapi import APIRouter, HTTPException
from sidecar.models.picture_lookup import LookupRequest, LookupResponse
from sidecar.services.classifier import classify_image

router = APIRouter(tags=["picture-lookup"])


@router.post("/picture-lookup", response_model=LookupResponse)
async def picture_lookup(req: LookupRequest) -> LookupResponse:
    if not req.image_b64:
        raise HTTPException(status_code=400, detail="image_b64 is required")
    return await classify_image(req.image_b64, mode="set")
