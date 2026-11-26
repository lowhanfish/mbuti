"""/api/v1/admin/kantor/state."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.kantor import service
from app.api.v1.endpoints.admin.kantor.schema import OfficeState

router = APIRouter(prefix="/kantor", tags=["Kantor"])


@router.get("/state", response_model=ApiResponse[OfficeState])
async def read_state(
    member: CurrentMember = Depends(get_current_member), session: AsyncSession = Depends(get_db)
) -> ApiResponse[OfficeState]:
    return ApiResponse(data=await service.build_state(session, member.organization_id))
