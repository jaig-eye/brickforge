"""
BrickForge AI Sidecar — FastAPI entry point.
Spawned by Electron main on port 8741 (configurable via BF_SIDECAR_PORT).
"""
import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sidecar.routers import health, picture_lookup, piece_id, builder
from sidecar.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("brickforge.sidecar")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("BrickForge sidecar starting…")
    yield
    logger.info("BrickForge sidecar shutting down…")


settings = get_settings()

app = FastAPI(
    title="BrickForge AI Sidecar",
    version="0.1.0-alpha",
    lifespan=lifespan,
    docs_url="/docs" if settings.bf_env == "development" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "file://"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router)
app.include_router(picture_lookup.router, prefix="/api/v1")
app.include_router(piece_id.router, prefix="/api/v1")
app.include_router(builder.router, prefix="/api/v1")


if __name__ == "__main__":
    port = int(os.getenv("BF_SIDECAR_PORT", "8741"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
