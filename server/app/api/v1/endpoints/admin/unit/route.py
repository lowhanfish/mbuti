"""/api/v1/admin/unit."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, require_manager
from app.api.v1.common import ApiListResponse, ApiResponse, Option, Paging, paging
from app.api.v1.endpoints.admin.unit import service
from app.api.v1.endpoints.admin.unit.schema import UnitItem, UnitWrite

router = APIRouter(prefix="/unit", tags=["Unit"])


@router.get("/read", response_model=ApiListResponse[UnitItem])
async def read_units(
    search: str = "",
    page: Paging = Depends(paging(10)),
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiListResponse[UnitItem]:
    total, data = await service.read_units(session, member.organization_id, search, page)
    return ApiListResponse(total=total, skip=page.skip, limit=page.limit, data=data)


@router.get("/option", response_model=ApiResponse[list[Option]])
async def unit_options(
    member: CurrentMember = Depends(get_current_member), session: AsyncSession = Depends(get_db)
) -> ApiResponse[list[Option]]:
    return ApiResponse(data=await service.unit_options(session, member.organization_id))


@router.post("/create", response_model=ApiResponse[UnitItem], status_code=status.HTTP_201_CREATED)
async def create_unit(
    body: UnitWrite,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[UnitItem]:
    data = await service.create_unit(session, member.organization_id, member.user.id, body)
    return ApiResponse(statusCode=201, message="Unit ditambahkan.", data=data)


@router.put("/update/{unit_id}", response_model=ApiResponse[UnitItem])
async def update_unit(
    unit_id: str,
    body: UnitWrite,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[UnitItem]:
    data = await service.update_unit(session, member.organization_id, unit_id, body)
    return ApiResponse(message="Unit diperbarui.", data=data)


@router.delete("/delete/{unit_id}", response_model=ApiResponse[None])
async def delete_unit(
    unit_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.delete_unit(session, member.organization_id, unit_id)
    return ApiResponse(message="Unit dihapus.", data=None)
