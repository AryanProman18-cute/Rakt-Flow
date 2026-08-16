from fastapi import APIRouter, Response, status

from app.schemas.api import HealthResponse

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@router.head("/health", status_code=status.HTTP_204_NO_CONTENT)
@router.head("/ping", status_code=status.HTTP_204_NO_CONTENT)
async def keep_warm() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "no-store"})
