"""Hari kerja, shift, dan tanggal khusus organisasi (kontrak 17.1)."""

import csv
import datetime
import io
import re
import uuid

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import MANAGERS, CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.kalender.schema import (
    CalendarDayItem,
    CalendarDayRequest,
    CalendarSettings,
    ImportResult,
    ShiftItem,
    ShiftRequest,
    parse_date,
)
from app.core.exceptions import (
    ConflictException,
    NotFoundException,
    UnprocessableEntityException,
    validation_message,
)
from app.db.transaction import commit_or_raise_unique_conflict
from app.models import CalendarDay, Organization, Schedule, WorkShift
from app.services.organisation import lock_organization
from app.services.schedule.planning import refresh_organization

SHIFT_NOT_FOUND = "Shift tidak ditemukan."
DAY_NOT_FOUND = "Tanggal tidak ditemukan."
DUPLICATE_SHIFT = "Sudah ada shift dengan nama itu."
MAX_CSV_BYTES = 200_000
MAX_CSV_ROWS = 1000
MAX_ERRORS = 20
CSV_TOO_LARGE = "Berkas CSV paling besar 200 KB."
CSV_NOT_TEXT = "Berkas harus berupa teks CSV berkode UTF-8."
NOTHING_IMPORTED = "Tidak ada baris yang bisa diimpor."


def _shift_item(shift: WorkShift) -> ShiftItem:
    return ShiftItem(
        id=str(shift.id),
        name=shift.name,
        start_time=shift.start_time.strftime("%H:%M"),
        end_time=shift.end_time.strftime("%H:%M"),
        weekdays=shift.weekdays,
    )


async def read_calendar(session: AsyncSession, actor: CurrentMember) -> CalendarSettings:
    organization = await session.get(Organization, actor.organization_id)
    shifts = await session.scalars(
        select(WorkShift)
        .where(WorkShift.organization_id == actor.organization_id)
        .order_by(WorkShift.start_time, func.lower(WorkShift.name))
    )
    return CalendarSettings(
        timezone=organization.timezone,
        workdays=organization.workdays,
        shifts=[_shift_item(s) for s in shifts],
        can_edit=actor.access_role in MANAGERS,
    )


async def save_workdays(session: AsyncSession, actor: CurrentMember, workdays: list[int]) -> None:
    organization = await session.get(Organization, actor.organization_id)
    organization.workdays = workdays
    await refresh_organization(session, actor.organization_id)
    await session.commit()


def _apply_shift(shift: WorkShift, body: ShiftRequest) -> None:
    shift.name = body.name
    shift.start_time = datetime.time.fromisoformat(body.start_time)
    shift.end_time = datetime.time.fromisoformat(body.end_time)
    shift.weekdays = body.weekdays


async def create_shift(session: AsyncSession, actor: CurrentMember, body: ShiftRequest) -> None:
    shift = WorkShift(
        id=uuid.uuid4(), organization_id=actor.organization_id, created_by=actor.user.id
    )
    _apply_shift(shift, body)
    session.add(shift)
    await commit_or_raise_unique_conflict(session, DUPLICATE_SHIFT)


async def _owned(
    session: AsyncSession, model, organization_id: uuid.UUID, value: str, missing: str
):
    found = await session.scalar(
        select(model).where(
            model.id == parse_id(value, missing), model.organization_id == organization_id
        )
    )
    if found is None:
        raise NotFoundException(missing)
    return found


async def update_shift(
    session: AsyncSession, actor: CurrentMember, shift_id: str, body: ShiftRequest
) -> None:
    shift = await _owned(session, WorkShift, actor.organization_id, shift_id, SHIFT_NOT_FOUND)
    _apply_shift(shift, body)
    try:
        # Disimpan lebih dulu agar nama yang sama ketahuan sebelum jadwal dihitung ulang
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictException(DUPLICATE_SHIFT) from None
    await refresh_organization(session, actor.organization_id)
    await session.commit()


async def delete_shift(session: AsyncSession, actor: CurrentMember, shift_id: str) -> None:
    await lock_organization(session, actor.organization_id)
    shift = await _owned(session, WorkShift, actor.organization_id, shift_id, SHIFT_NOT_FOUND)
    used_by = await session.scalar(
        select(Schedule.title).where(Schedule.shift_id == shift.id).limit(1)
    )
    if used_by is not None:
        raise ConflictException(f'Shift masih dipakai tugas rutin "{used_by}".')
    await session.delete(shift)
    await session.commit()


async def read_days(
    session: AsyncSession, organization_id: uuid.UUID, year: str
) -> list[CalendarDayItem]:
    query = select(CalendarDay).where(CalendarDay.organization_id == organization_id)
    if re.fullmatch(r"[1-9]\d{3}", year):
        query = query.where(
            CalendarDay.date.between(
                datetime.date(int(year), 1, 1), datetime.date(int(year), 12, 31)
            )
        )
    return [
        CalendarDayItem(id=str(d.id), date=d.date, kind=d.kind, name=d.name, label=d.label)
        for d in await session.scalars(query.order_by(CalendarDay.date))
    ]


async def _upsert_days(
    session: AsyncSession, actor: CurrentMember, days: dict[datetime.date, CalendarDayRequest]
) -> set[datetime.date]:
    """
    Isian baru menggantikan tanggal yang sama. Mengembalikan tanggal yang sudah ada.
    Pemanggil sudah mengunci organisasi.
    """
    existing = {
        d.date: d
        for d in await session.scalars(
            select(CalendarDay).where(
                CalendarDay.organization_id == actor.organization_id,
                CalendarDay.date.in_(list(days)),
            )
        )
    }
    for date, body in days.items():
        row = existing.get(date)
        if row is None:
            row = CalendarDay(
                organization_id=actor.organization_id, date=date, created_by=actor.user.id
            )
            session.add(row)
        row.kind, row.name, row.label = body.kind, body.name, body.label
    return set(existing)


async def save_day(session: AsyncSession, actor: CurrentMember, body: CalendarDayRequest) -> None:
    await lock_organization(session, actor.organization_id)
    await _upsert_days(session, actor, {parse_date(body.date): body})
    await refresh_organization(session, actor.organization_id)
    await session.commit()


async def delete_day(session: AsyncSession, actor: CurrentMember, day_id: str) -> None:
    day = await _owned(session, CalendarDay, actor.organization_id, day_id, DAY_NOT_FOUND)
    await session.delete(day)
    await refresh_organization(session, actor.organization_id)
    await session.commit()


def parse_csv(content: bytes) -> tuple[list[CalendarDayRequest], list[str]]:
    """Baris `tanggal,nama,jenis`. Baris yang salah dilaporkan, yang benar tetap dipakai."""
    if len(content) > MAX_CSV_BYTES:
        raise UnprocessableEntityException(CSV_TOO_LARGE)
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise UnprocessableEntityException(CSV_NOT_TEXT) from None
    if "\x00" in text:
        raise UnprocessableEntityException(CSV_NOT_TEXT)

    first = next((line for line in text.splitlines() if line.strip()), "")
    delimiter = ";" if first.count(";") > first.count(",") else ","
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, skipinitialspace=True)
    rows: list[tuple[int, list[str]]] = []
    try:
        for cells in reader:
            cells = [cell.strip() for cell in cells]
            if any(cells):
                rows.append((reader.line_num, cells))
    except csv.Error:
        raise UnprocessableEntityException(CSV_NOT_TEXT) from None
    if rows and rows[0][1][0].lower().startswith("tanggal"):
        rows = rows[1:]
    if len(rows) > MAX_CSV_ROWS:
        raise UnprocessableEntityException("Paling banyak 1.000 baris per berkas.")

    days: list[CalendarDayRequest] = []
    errors: list[str] = []
    for number, cells in rows:
        date, name, label = (cells + ["", ""])[:3]
        kind = "workday" if "hari kerja" in label.lower() else "holiday"
        try:
            days.append(CalendarDayRequest(date=date, name=name, label=label, kind=kind))
        except ValidationError as exc:
            errors.append(f"Baris {number}: {validation_message(exc.errors())}")
    return days, errors


async def import_days(session: AsyncSession, actor: CurrentMember, content: bytes) -> ImportResult:
    days, errors = parse_csv(content)
    if not days:
        raise UnprocessableEntityException(errors[0] if errors else NOTHING_IMPORTED)
    await lock_organization(session, actor.organization_id)
    # Tanggal berulang di satu berkas: baris terakhir yang dipakai
    unique = {parse_date(day.date): day for day in days}
    existing = await _upsert_days(session, actor, unique)
    await refresh_organization(session, actor.organization_id)
    await session.commit()
    added = len(unique) - len(existing)
    return ImportResult(added=added, updated=len(days) - added, errors=errors[:MAX_ERRORS])
