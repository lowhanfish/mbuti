"""/api/v1/admin/role/{role_id}/brankas."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.brankas import service
from app.api.v1.endpoints.admin.brankas.schema import (
    CodeBody,
    VaultAccountItem,
    VaultCode,
    VaultData,
    VaultInput,
)

router = APIRouter(prefix="/role/{role_id}/brankas", tags=["Brankas"])


@router.get("", response_model=ApiResponse[VaultData])
async def read_vault(
    role_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[VaultData]:
    return ApiResponse(data=await service.read_vault(session, member, role_id))


# Hak akses diperiksa service: hanya penanggung jawab role, apa pun hak organisasinya
@router.post("", response_model=ApiResponse[VaultAccountItem], status_code=status.HTTP_201_CREATED)
async def create_account(
    role_id: str,
    body: VaultInput,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[VaultAccountItem]:
    data = await service.create_account(session, member, role_id, body)
    return ApiResponse(statusCode=201, message="Akun disimpan di brankas.", data=data)


@router.put("/{account_id}", response_model=ApiResponse[VaultAccountItem])
async def update_account(
    role_id: str,
    account_id: str,
    body: VaultInput,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[VaultAccountItem]:
    data = await service.update_account(session, member, role_id, account_id, body)
    return ApiResponse(message="Akun diperbarui.", data=data)


@router.post("/{account_id}/hapus", response_model=ApiResponse[None])
async def delete_account(
    role_id: str,
    account_id: str,
    body: CodeBody,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.delete_account(session, member, role_id, account_id, body.code)
    return ApiResponse(message="Akun dihapus dari brankas.", data=None)


@router.post("/{account_id}/konfirmasi", response_model=ApiResponse[VaultAccountItem])
async def confirm_account(
    role_id: str,
    account_id: str,
    body: CodeBody,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[VaultAccountItem]:
    data = await service.confirm_account(session, member, role_id, account_id, body.code)
    return ApiResponse(message="Akun dikonfirmasi.", data=data)


@router.post("/{account_id}/kode", response_model=ApiResponse[VaultCode])
async def show_code(
    role_id: str,
    account_id: str,
    body: CodeBody,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[VaultCode]:
    data = await service.show_code(session, member, role_id, account_id, body.code)
    return ApiResponse(data=data)
