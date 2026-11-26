"""/api/v1/admin/persetujuan."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db
from app.api.v1.common import ApiResponse, Paging, paging
from app.api.v1.endpoints.admin.persetujuan import service
from app.api.v1.endpoints.admin.persetujuan.schema import ApprovalList, Decision
from app.services.engine.views import ApprovalItem

router = APIRouter(prefix="/persetujuan", tags=["Persetujuan"])


@router.get("/read", response_model=ApprovalList)
async def read_approvals(
    status: str = "pending",
    page: Paging = Depends(paging(50)),
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApprovalList:
    total, data = await service.read_approvals(session, member, status, page)
    return ApprovalList(
        total=total,
        skip=page.skip,
        limit=page.limit,
        data=data,
        pending_count=await service.count_pending(session, member),
    )


@router.post("/{approval_id}/decide", response_model=ApiResponse[ApprovalItem])
async def decide(
    approval_id: str,
    body: Decision,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ApprovalItem]:
    data = await service.decide(session, member, approval_id, body)
    return ApiResponse(message="Keputusan tersimpan.", data=data)
