"""/api/v1/admin/dashboard/summary."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.dashboard import service
from app.api.v1.endpoints.admin.dashboard.schema import Summary

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=ApiResponse[Summary])
async def read_summary(
    member: CurrentMember = Depends(get_current_member), session: AsyncSession = Depends(get_db)
) -> ApiResponse[Summary]:
    return ApiResponse(data=await service.read_summary(session, member))
