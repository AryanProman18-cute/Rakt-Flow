from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.migrate import apply_migrations

settings = get_settings()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_production()
    # Apply pending SQL migrations before serving (session-based, best effort:
    # a migration failure is logged and the API still starts).
    try:
        async with SessionLocal() as session:
            await apply_migrations(session)
    except Exception as exc:  # pragma: no cover - depends on live DB state
        logger.warning("migrations_skipped", error=str(exc))
    logger.info("raktflow_api_started", environment=settings.app_env)
    yield
    logger.info("raktflow_api_stopped")


app = FastAPI(
    title="RaktFlow API",
    version="3.3.0",
    description="Verified blood donation and emergency logistics orchestration API.",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.app_env != "production" else None,
    redoc_url=None,
)

# Normalize configured origins and always include PUBLIC_APP_URL. This prevents
# a harmless trailing slash or a missing CORS_ORIGINS entry from breaking the
# authenticated bootstrap after Firebase sign-in.
allowed_origins = {
    str(origin).strip().rstrip("/")
    for origin in [*settings.cors_origins, settings.public_app_url]
    if str(origin).strip().startswith(("https://", "http://"))
}
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        max_age=600,
    )

app.include_router(api_router, prefix=settings.api_prefix)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(self), geolocation=(self), microphone=()"
    response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") else "public, max-age=60"
    return response
