"""/api/v1/admin/audit. Hanya pemilik dan admin."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_db, require_access
from app.api.v1.common import ApiListResponse, Paging, paging
from app.api.v1.endpoints.admin.audit import service
from app.api.v1.endpoints.admin.audit.schema import AuditItem

router = APIRouter(prefix="/audit", tags=["Jejak audit"])
require_auditor = require_access(
    "owner", "admin", message="Jejak audit hanya untuk pemilik dan admin."
)


@router.get("/read", response_model=ApiListResponse[AuditItem])
async def read_logs(
    search: str = "",
    group: str = "",
    page: Paging = Depends(paging(50)),
    member: CurrentMember = Depends(require_auditor),
    session: AsyncSession = Depends(get_db),
) -> ApiListResponse[AuditItem]:
    total, data = await service.read_logs(session, member.organization_id, search, group, page)
    return ApiListResponse(total=total, skip=page.skip, limit=page.limit, data=data)
