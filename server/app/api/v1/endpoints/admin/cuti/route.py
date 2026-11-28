"""/api/v1/admin/organisasi/pengguna/{member_id}/cuti (kontrak 17.2)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.cuti import service
from app.api.v1.endpoints.admin.cuti.schema import LeaveItem, LeaveRequest

router = APIRouter(prefix="/organisasi/pengguna/{member_id}/cuti", tags=["Cuti anggota"])


@router.get("", response_model=ApiResponse[list[LeaveItem]])
async def read_leaves(
    member_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[LeaveItem]]:
    return ApiResponse(data=await service.read_leaves(session, member, member_id))


@router.post("", response_model=ApiResponse[None], status_code=status.HTTP_201_CREATED)
async def create_leave(
    member_id: str,
    body: LeaveRequest,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.create_leave(session, member, member_id, body)
    return ApiResponse(statusCode=201, message="Cuti tersimpan.", data=None)


@router.delete("/{leave_id}", response_model=ApiResponse[None])
async def delete_leave(
    member_id: str,
    leave_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.delete_leave(session, member, member_id, leave_id)
    return ApiResponse(message="Cuti dihapus.", data=None)
