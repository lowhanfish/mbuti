"""GET /api/v1/health (publik)."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.v1.endpoints.health import service
from app.api.v1.endpoints.health.schema import HealthResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={503: {"model": HealthResponse}},
)
async def health_check(
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> HealthResponse:
    """200 bila semua layanan siap, 503 bila ada yang tidak siap."""
    data = await service.get_health(session)
    healthy = data.status == "ok"
    response.status_code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        success=healthy,
        statusCode=response.status_code,
        message="Layanan berjalan normal." if healthy else "Sebagian layanan belum siap.",
        data=data,
    )
