"""/api/v1/admin/role/{id}/pembentukan, /versi, dan /api/v1/admin/alat (kontrak 16.1, 16.2)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, limited
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.pembentukan import service
from app.api.v1.endpoints.admin.pembentukan.schema import (
    AnswerRequest,
    CardUpdateRequest,
    FinalRequest,
    Formation,
    MaterialsRequest,
    StartRequest,
    ToolCatalogItem,
    ToolRequestItem,
    VersionDetail,
    VersionItem,
)

router = APIRouter(prefix="/role", tags=["Pembentukan role"])
tools_router = APIRouter(prefix="/alat", tags=["Alat"])

# Hak membentuk (admin ke atas atau penanggung jawab role) diperiksa di service per role
Member = Depends(get_current_member)
Session = Depends(get_db)


@router.get("/{role_id}/pembentukan", response_model=ApiResponse[Formation])
async def read_formation(
    role_id: str, member: CurrentMember = Member, session: AsyncSession = Session
) -> ApiResponse[Formation]:
    return ApiResponse(data=await service.read_formation(session, member, role_id))


@router.post(
    "/{role_id}/pembentukan/mulai",
    response_model=ApiResponse[Formation],
    status_code=status.HTTP_201_CREATED,
)
async def start(
    role_id: str,
    body: StartRequest,
    member: CurrentMember = Member,
    session: AsyncSession = Session,
) -> ApiResponse[Formation]:
    data = await service.start(session, member, role_id, body.from_version_id)
    return ApiResponse(statusCode=201, message="Revisi baru dibuat.", data=data)


@router.put("/{role_id}/pembentukan/bahan", response_model=ApiResponse[Formation])
async def save_materials(
    role_id: str,
    body: MaterialsRequest,
    member: CurrentMember = Member,
    session: AsyncSession = Session,
) -> ApiResponse[Formation]:
    data = await service.save_materials(session, member, role_id, body)
    return ApiResponse(message="Bahan disimpan.", data=data)


@router.post(
    "/{role_id}/pembentukan/analisis",
    response_model=ApiResponse[Formation],
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[limited("pembentukan", "RATE_FORMATION_PER_MINUTE")],
)
async def run_analysis(
    role_id: str, member: CurrentMember = Member, session: AsyncSession = Session
) -> ApiResponse[Formation]:
    data = await service.run_analysis(session, member, role_id)
    return ApiResponse(statusCode=202, message="Analisis dimulai.", data=data)


@router.put("/{role_id}/pembentukan/kartu", response_model=ApiResponse[Formation])
async def save_card(
    role_id: str,
    body: CardUpdateRequest,
    member: CurrentMember = Member,
    session: AsyncSession = Session,
) -> ApiResponse[Formation]:
    data = await service.save_card(session, member, role_id, body)
    return ApiResponse(message="Kartu disimpan.", data=data)


@router.post(
    "/{role_id}/pembentukan/jawab",
    response_model=ApiResponse[Formation],
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[limited("pembentukan", "RATE_FORMATION_PER_MINUTE")],
)
async def answer(
    role_id: str,
    body: AnswerRequest,
    member: CurrentMember = Member,
    session: AsyncSession = Session,
) -> ApiResponse[Formation]:
    data = await service.answer(session, member, role_id, body)
    return ApiResponse(statusCode=202, message="Jawaban dikirim.", data=data)


@router.post("/{role_id}/pembentukan/final", response_model=ApiResponse[Formation])
async def finalize(
    role_id: str,
    body: FinalRequest,
    member: CurrentMember = Member,
    session: AsyncSession = Session,
) -> ApiResponse[Formation]:
    data = await service.finalize_revision(session, member, role_id, body)
    return ApiResponse(message=f"Versi {data.version_no} Final.", data=data)


@router.post("/{role_id}/pembentukan/batal", response_model=ApiResponse[None])
async def discard(
    role_id: str, member: CurrentMember = Member, session: AsyncSession = Session
) -> ApiResponse[None]:
    await service.discard(session, member, role_id)
    return ApiResponse(message="Revisi dibuang.", data=None)


@router.get("/{role_id}/versi", response_model=ApiResponse[list[VersionItem]])
async def read_versions(
    role_id: str, member: CurrentMember = Member, session: AsyncSession = Session
) -> ApiResponse[list[VersionItem]]:
    return ApiResponse(data=await service.read_versions(session, member, role_id))


@router.get("/{role_id}/versi/{version_id}", response_model=ApiResponse[VersionDetail])
async def read_version(
    role_id: str, version_id: str, member: CurrentMember = Member, session: AsyncSession = Session
) -> ApiResponse[VersionDetail]:
    return ApiResponse(data=await service.read_version(session, member, role_id, version_id))


@router.post(
    "/{role_id}/versi/{version_id}/pulihkan",
    response_model=ApiResponse[Formation],
    status_code=status.HTTP_201_CREATED,
)
async def restore(
    role_id: str, version_id: str, member: CurrentMember = Member, session: AsyncSession = Session
) -> ApiResponse[Formation]:
    data = await service.restore(session, member, role_id, version_id)
    return ApiResponse(statusCode=201, message="Revisi dari versi lama dibuat.", data=data)


@tools_router.get("/katalog", response_model=ApiResponse[list[ToolCatalogItem]])
async def tool_catalog(_: CurrentMember = Member) -> ApiResponse[list[ToolCatalogItem]]:
    return ApiResponse(data=service.tool_catalog())


@tools_router.get("/permintaan", response_model=ApiResponse[list[ToolRequestItem]])
async def tool_requests(
    member: CurrentMember = Member, session: AsyncSession = Session
) -> ApiResponse[list[ToolRequestItem]]:
    return ApiResponse(data=await service.tool_requests(session, member.organization_id))
