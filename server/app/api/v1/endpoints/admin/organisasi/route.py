"""/api/v1/admin/organisasi/profil."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, require_manager
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.organisasi import service
from app.api.v1.endpoints.admin.organisasi.schema import Profile, ProfileUpdate

router = APIRouter(prefix="/organisasi", tags=["Organisasi"])


@router.get("/profil", response_model=ApiResponse[Profile])
async def read_profile(
    member: CurrentMember = Depends(get_current_member), session: AsyncSession = Depends(get_db)
) -> ApiResponse[Profile]:
    return ApiResponse(data=await service.read_profile(session, member.organization_id))


@router.put("/profil/update", response_model=ApiResponse[Profile])
async def update_profile(
    body: ProfileUpdate,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[Profile]:
    data = await service.update_profile(session, member.organization_id, body)
    return ApiResponse(message="Profil organisasi diperbarui.", data=data)
