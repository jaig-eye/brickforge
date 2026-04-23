from pydantic import BaseModel
from typing import Optional


class BuilderRequest(BaseModel):
    prompt: str
    opts: Optional[dict] = None


class BuilderResponse(BaseModel):
    job_id: str
    status: str  # "queued" | "running" | "done" | "error"
    ldraw_url: Optional[str] = None
    error: Optional[str] = None
