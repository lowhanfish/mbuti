"""/api/v1/admin/pengetahuan/usulan (kontrak 16.7)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    CurrentMember,
    get_current_member,
    get_db,
    limited,
    require_access,
    require_manager,
)
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.usulan import service
from app.api.v1.endpoints.admin.usulan.schema import ProposalItem, ProposalList, ProposalRequest

# Didaftarkan sebelum router pengetahuan agar "usulan" tidak terbaca sebagai ID dokumen
router = APIRouter(prefix="/pengetahuan/usulan", tags=["Usulan pengetahuan"])
require_proposer = require_access(
    "owner", "admin", "member", message="Pemantau tidak dapat mengusulkan pengetahuan."
)


@router.get("", response_model=ProposalList)
async def read_proposals(
    status: str = "",
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ProposalList:
    data, summary = await service.read_proposals(session, member.organization_id, status)
    return ProposalList(total=len(data), skip=0, limit=len(data), data=data, summary=summary)


@router.post(
    "",
    response_model=ApiResponse[ProposalItem],
    status_code=status.HTTP_201_CREATED,
    dependencies=[limited("usulan", "RATE_PROPOSAL_PER_MINUTE")],
)
async def create_proposal(
    body: ProposalRequest,
    member: CurrentMember = Depends(require_proposer),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ProposalItem]:
    data = await service.create_proposal(session, member, body)
    return ApiResponse(statusCode=201, message="Usulan dikirim ke admin.", data=data)


@router.post("/{proposal_id}/setujui", response_model=ApiResponse[ProposalItem])
async def approve(
    proposal_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ProposalItem]:
    data = await service.approve(session, member, proposal_id)
    return ApiResponse(
        message="Usulan disetujui dan disimpan sebagai pengetahuan organisasi.", data=data
    )


@router.post("/{proposal_id}/tolak", response_model=ApiResponse[ProposalItem])
async def reject(
    proposal_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ProposalItem]:
    return ApiResponse(
        message="Usulan ditolak.", data=await service.reject(session, member, proposal_id)
    )
