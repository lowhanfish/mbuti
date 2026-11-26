"""/api/v1/admin/pengaturan."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, require_manager
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.pengaturan import service
from app.api.v1.endpoints.admin.pengaturan.schema import (
    BudgetSettings,
    BudgetUpdate,
    ModelSettings,
    ModelUpdate,
)

router = APIRouter(prefix="/pengaturan", tags=["Pengaturan"])


@router.get("/model-ai", response_model=ApiResponse[ModelSettings])
async def read_models(
    member: CurrentMember = Depends(get_current_member), session: AsyncSession = Depends(get_db)
) -> ApiResponse[ModelSettings]:
    return ApiResponse(data=await service.read_models(session, member))


@router.put("/model-ai/update", response_model=ApiResponse[ModelSettings])
async def update_models(
    body: ModelUpdate,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ModelSettings]:
    data = await service.update_models(session, member, body)
    return ApiResponse(message="Model AI diperbarui.", data=data)


@router.get("/batas-biaya", response_model=ApiResponse[BudgetSettings])
async def read_budget(
    member: CurrentMember = Depends(get_current_member), session: AsyncSession = Depends(get_db)
) -> ApiResponse[BudgetSettings]:
    return ApiResponse(data=await service.read_budget(session, member))


@router.put("/batas-biaya/update", response_model=ApiResponse[BudgetSettings])
async def update_budget(
    body: BudgetUpdate,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[BudgetSettings]:
    data = await service.update_budget(session, member, body)
    return ApiResponse(message="Batas biaya diperbarui.", data=data)
