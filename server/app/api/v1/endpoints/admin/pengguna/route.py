"""/api/v1/admin/pengguna."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, require_manager
from app.api.v1.common import ApiResponse, Paging, paging
from app.api.v1.endpoints.admin.pengguna import service
from app.api.v1.endpoints.admin.pengguna.schema import (
    InviteRequest,
    MemberItem,
    MemberList,
    MemberUpdate,
)

router = APIRouter(prefix="/pengguna", tags=["Pengguna"])


@router.get("/read", response_model=MemberList)
async def read_members(
    search: str = "",
    access_role: str = "",
    status: str = "",
    page: Paging = Depends(paging(10)),
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> MemberList:
    total, data, summary = await service.read_members(
        session, member, search, access_role, status, page
    )
    return MemberList(total=total, skip=page.skip, limit=page.limit, data=data, summary=summary)


@router.post("/invite", response_model=ApiResponse[MemberItem], status_code=status.HTTP_201_CREATED)
async def invite(
    body: InviteRequest,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[MemberItem]:
    data = await service.invite(session, member, body)
    return ApiResponse(statusCode=201, message="Undangan terkirim.", data=data)


@router.post("/resend-invite/{member_id}", response_model=ApiResponse[MemberItem])
async def resend_invite(
    member_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[MemberItem]:
    data = await service.resend_invite(session, member, member_id)
    return ApiResponse(message="Undangan dikirim ulang.", data=data)


@router.put("/update/{member_id}", response_model=ApiResponse[MemberItem])
async def update_member(
    member_id: str,
    body: MemberUpdate,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[MemberItem]:
    data = await service.update_member(session, member, member_id, body)
    return ApiResponse(message="Pengguna diperbarui.", data=data)


@router.delete("/delete/{member_id}", response_model=ApiResponse[None])
async def remove_member(
    member_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.remove_member(session, member, member_id)
    return ApiResponse(message="Pengguna dikeluarkan dari organisasi.", data=None)
