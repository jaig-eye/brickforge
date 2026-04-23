from fastapi import APIRouter, HTTPException
from sidecar.models.piece_id import PieceIdRequest, PieceIdResponse
from sidecar.services.piece_detector import detect_pieces

router = APIRouter(tags=["piece-identifier"])


@router.post("/piece-identify", response_model=PieceIdResponse)
async def piece_identify(req: PieceIdRequest) -> PieceIdResponse:
    if not req.image_b64:
        raise HTTPException(status_code=400, detail="image_b64 is required")
    return await detect_pieces(req.image_b64)
