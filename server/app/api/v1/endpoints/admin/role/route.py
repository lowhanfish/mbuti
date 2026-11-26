"""/api/v1/admin/role. Uji coba role dibuat pada tahap B4."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, require_manager
from app.api.v1.common import ApiResponse, Option, Paging, paging
from app.api.v1.endpoints.admin.role import service
from app.api.v1.endpoints.admin.role.schema import RoleCreate, RoleItem, RoleList, RoleUpdate

router = APIRouter(prefix="/role", tags=["Role"])


@router.get("/read", response_model=RoleList)
async def read_roles(
    search: str = "",
    unit_id: str = "",
    status: str = "",
    page: Paging = Depends(paging(50)),
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> RoleList:
    total, data, summary = await service.read_roles(
        session, member.organization_id, search, unit_id, status, page
    )
    return RoleList(total=total, skip=page.skip, limit=page.limit, data=data, summary=summary)


@router.get("/option", response_model=ApiResponse[list[Option]])
async def role_options(
    member: CurrentMember = Depends(get_current_member), session: AsyncSession = Depends(get_db)
) -> ApiResponse[list[Option]]:
    return ApiResponse(data=await service.role_options(session, member.organization_id))


@router.post("/create", response_model=ApiResponse[RoleItem], status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RoleItem]:
    data = await service.create_role(session, member, body)
    return ApiResponse(statusCode=201, message="Role dibuat.", data=data)


@router.put("/update/{role_id}", response_model=ApiResponse[RoleItem])
async def update_role(
    role_id: str,
    body: RoleUpdate,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RoleItem]:
    data = await service.update_role(session, member.organization_id, role_id, body)
    return ApiResponse(message="Role diperbarui.", data=data)


@router.delete("/delete/{role_id}", response_model=ApiResponse[None])
async def delete_role(
    role_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.delete_role(session, member.organization_id, role_id)
    return ApiResponse(message="Role dihapus.", data=None)


# Terakhir: "/{role_id}" tidak boleh menelan "/read" dan "/option"
@router.get("/{role_id}", response_model=ApiResponse[RoleItem])
async def read_role(
    role_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RoleItem]:
    return ApiResponse(data=await service.read_role(session, member.organization_id, role_id))
