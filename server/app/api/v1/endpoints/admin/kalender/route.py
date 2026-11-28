"""/api/v1/admin/pengaturan/kalender (kontrak 17.1)."""

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, require_manager
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.kalender import service
from app.api.v1.endpoints.admin.kalender.schema import (
    CalendarDayItem,
    CalendarDayRequest,
    CalendarSettings,
    ImportResult,
    ShiftRequest,
    WorkdaysUpdate,
)
from app.core.exceptions import UnprocessableEntityException

router = APIRouter(prefix="/pengaturan/kalender", tags=["Kalender kerja"])


@router.get("", response_model=ApiResponse[CalendarSettings])
async def read_calendar(
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CalendarSettings]:
    return ApiResponse(data=await service.read_calendar(session, member))


@router.put("", response_model=ApiResponse[None])
async def save_workdays(
    body: WorkdaysUpdate,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.save_workdays(session, member, body.workdays)
    return ApiResponse(message="Hari kerja tersimpan.", data=None)


@router.post("/shift", response_model=ApiResponse[None], status_code=status.HTTP_201_CREATED)
async def create_shift(
    body: ShiftRequest,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.create_shift(session, member, body)
    return ApiResponse(statusCode=201, message="Shift tersimpan.", data=None)


@router.put("/shift/{shift_id}", response_model=ApiResponse[None])
async def update_shift(
    shift_id: str,
    body: ShiftRequest,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.update_shift(session, member, shift_id, body)
    return ApiResponse(message="Shift diperbarui.", data=None)


@router.delete("/shift/{shift_id}", response_model=ApiResponse[None])
async def delete_shift(
    shift_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.delete_shift(session, member, shift_id)
    return ApiResponse(message="Shift dihapus.", data=None)


@router.get("/hari", response_model=ApiResponse[list[CalendarDayItem]])
async def read_days(
    year: str = "",
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[CalendarDayItem]]:
    return ApiResponse(data=await service.read_days(session, member.organization_id, year))


@router.post("/hari", response_model=ApiResponse[None], status_code=status.HTTP_201_CREATED)
async def save_day(
    body: CalendarDayRequest,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.save_day(session, member, body)
    return ApiResponse(statusCode=201, message="Tanggal tersimpan.", data=None)


@router.post("/hari/impor", response_model=ApiResponse[ImportResult])
async def import_days(
    file: UploadFile | None = File(default=None),
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ImportResult]:
    if file is None or not file.filename:
        raise UnprocessableEntityException("Pilih berkas CSV.")
    # Dibaca paling banyak satu bita melebihi batas, cukup untuk tahu terlalu besar
    content = await file.read(service.MAX_CSV_BYTES + 1)
    data = await service.import_days(session, member, content)
    return ApiResponse(message="Impor selesai.", data=data)


@router.delete("/hari/{day_id}", response_model=ApiResponse[None])
async def delete_day(
    day_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.delete_day(session, member, day_id)
    return ApiResponse(message="Tanggal dihapus.", data=None)
