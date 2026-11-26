"""/api/v1/admin/relasi."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, require_manager
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.relasi import service
from app.api.v1.endpoints.admin.relasi.schema import (
    Graph,
    HumanRequest,
    PositionsRequest,
    RelationCreate,
    RelationItem,
    RelationUpdate,
)

router = APIRouter(prefix="/relasi", tags=["Peta Relasi"])


@router.get("/graph", response_model=ApiResponse[Graph])
async def read_graph(
    member: CurrentMember = Depends(get_current_member), session: AsyncSession = Depends(get_db)
) -> ApiResponse[Graph]:
    return ApiResponse(data=await service.read_graph(session, member.organization_id))


@router.post(
    "/create", response_model=ApiResponse[RelationItem], status_code=status.HTTP_201_CREATED
)
async def create_relation(
    body: RelationCreate,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RelationItem]:
    data = await service.create_relation(session, member, body)
    return ApiResponse(statusCode=201, message="Relasi dibuat.", data=data)


@router.put("/update/{relation_id}", response_model=ApiResponse[RelationItem])
async def update_relation(
    relation_id: str,
    body: RelationUpdate,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RelationItem]:
    data = await service.update_relation(session, member.organization_id, relation_id, body)
    return ApiResponse(message="Relasi diperbarui.", data=data)


@router.delete("/delete/{relation_id}", response_model=ApiResponse[None])
async def delete_relation(
    relation_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.delete_relation(session, member.organization_id, relation_id)
    return ApiResponse(message="Relasi dihapus.", data=None)


@router.put("/positions", response_model=ApiResponse[None])
async def save_positions(
    body: PositionsRequest,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.save_positions(session, member.organization_id, body)
    return ApiResponse(message="Posisi disimpan.", data=None)


@router.delete("/positions", response_model=ApiResponse[None])
async def reset_positions(
    member: CurrentMember = Depends(require_manager), session: AsyncSession = Depends(get_db)
) -> ApiResponse[None]:
    await service.reset_positions(session, member.organization_id)
    return ApiResponse(message="Posisi dikembalikan ke susunan otomatis.", data=None)


@router.post("/humans", response_model=ApiResponse[None])
async def add_human(
    body: HumanRequest,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.add_human(session, member.organization_id, body.member_id)
    return ApiResponse(message="Manusia ditambahkan ke peta.", data=None)


@router.delete("/humans/{member_id}", response_model=ApiResponse[None])
async def remove_human(
    member_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.remove_human(session, member.organization_id, member_id)
    return ApiResponse(message="Manusia dikeluarkan dari peta.", data=None)
