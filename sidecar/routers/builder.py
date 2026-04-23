from fastapi import APIRouter
from sidecar.models.builder import BuilderRequest, BuilderResponse
import uuid

router = APIRouter(tags=["ai-builder"])


@router.post("/builder/generate", response_model=BuilderResponse)
async def builder_generate(req: BuilderRequest) -> BuilderResponse:
    """
    AI Builder stub — premium feature, not yet implemented.
    Returns a queued job ID for future polling support.
    """
    return BuilderResponse(
        job_id=str(uuid.uuid4()),
        status="error",
        error="AI Builder is a premium feature not yet available in this alpha release.",
    )
