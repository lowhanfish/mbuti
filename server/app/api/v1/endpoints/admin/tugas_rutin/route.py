"""/api/v1/admin/tugas-rutin (kontrak 17.3–17.5)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, limited, require_access
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.tugas_rutin import service
from app.api.v1.endpoints.admin.tugas_rutin.schema import (
    ParseRequest,
    ParseResult,
    Preview,
    PreviewRequest,
    ScheduleDetail,
    ScheduleItem,
    ScheduleRequest,
)

router = APIRouter(prefix="/tugas-rutin", tags=["Tugas rutin"])
require_scheduler = require_access(
    "owner", "admin", "member", message="Pemantau tidak dapat membuat tugas rutin."
)


@router.get("", response_model=ApiResponse[list[ScheduleItem]])
async def read_schedules(
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[ScheduleItem]]:
    return ApiResponse(data=await service.read_schedules(session, member))


@router.post(
    "/pahami",
    response_model=ApiResponse[ParseResult],
    dependencies=[limited("jadwal", "RATE_SCHEDULE_PARSE_PER_MINUTE")],
)
async def understand(
    body: ParseRequest,
    member: CurrentMember = Depends(require_scheduler),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ParseResult]:
    return ApiResponse(data=await service.understand(session, member, body.text))


@router.post("/pratinjau", response_model=ApiResponse[Preview])
async def preview(
    body: PreviewRequest,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[Preview]:
    return ApiResponse(data=await service.preview(session, member, body))


@router.post("", response_model=ApiResponse[ScheduleItem], status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: ScheduleRequest,
    member: CurrentMember = Depends(require_scheduler),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ScheduleItem]:
    data = await service.create_schedule(session, member, body)
    return ApiResponse(statusCode=201, message="Tugas rutin tersimpan.", data=data)


@router.get("/{schedule_id}", response_model=ApiResponse[ScheduleDetail])
async def read_schedule(
    schedule_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ScheduleDetail]:
    return ApiResponse(data=await service.read_schedule(session, member, schedule_id))


@router.put("/{schedule_id}", response_model=ApiResponse[ScheduleItem])
async def update_schedule(
    schedule_id: str,
    body: ScheduleRequest,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ScheduleItem]:
    data = await service.update_schedule(session, member, schedule_id, body)
    return ApiResponse(message="Tugas rutin diperbarui.", data=data)


@router.delete("/{schedule_id}", response_model=ApiResponse[None])
async def delete_schedule(
    schedule_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.delete_schedule(session, member, schedule_id)
    return ApiResponse(message="Tugas rutin dihapus.", data=None)


@router.post("/{schedule_id}/jeda", response_model=ApiResponse[ScheduleDetail])
async def pause(
    schedule_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ScheduleDetail]:
    data = await service.pause(session, member, schedule_id)
    return ApiResponse(message="Tugas rutin dijeda.", data=data)


@router.post("/{schedule_id}/lanjutkan", response_model=ApiResponse[ScheduleDetail])
async def resume(
    schedule_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ScheduleDetail]:
    data = await service.resume(session, member, schedule_id)
    return ApiResponse(message="Tugas rutin aktif.", data=data)


@router.post("/{schedule_id}/jalankan", response_model=ApiResponse[ScheduleDetail])
async def run_now(
    schedule_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ScheduleDetail]:
    data, message = await service.run_now(session, member, schedule_id)
    return ApiResponse(message=message, data=data)


@router.post("/{schedule_id}/susulan/{run_id}", response_model=ApiResponse[ScheduleDetail])
async def backfill(
    schedule_id: str,
    run_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ScheduleDetail]:
    data, message = await service.backfill(session, member, schedule_id, run_id)
    return ApiResponse(message=message, data=data)
