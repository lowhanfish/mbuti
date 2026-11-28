"""Menghubungkan aturan jadwal dengan kalender, shift, dan cuti organisasi."""

import datetime
import uuid
from dataclasses import dataclass, replace
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Agent,
    CalendarDay,
    MemberLeave,
    Organization,
    Schedule,
    WorkShift,
)
from app.models.base import utcnow
from app.services.schedule.rules import ScheduleRule, Shift, WorkCalendar, occurrences


@dataclass
class OrganizationCalendar:
    """Kalender satu organisasi, dibaca sekali untuk banyak jadwal."""

    base: WorkCalendar
    shifts: dict[uuid.UUID, Shift]
    # role -> cuti penanggung jawabnya
    leaves: dict[uuid.UUID, tuple]

    def shift_of(self, rule: ScheduleRule) -> Shift | None:
        if rule.time_mode == "fixed":
            return None
        try:
            return self.shifts.get(uuid.UUID(rule.shift_id or ""))
        except ValueError:
            return None

    def for_rule(self, rule: ScheduleRule, agent_id: uuid.UUID | None = None) -> WorkCalendar:
        return replace(self.base, shift=self.shift_of(rule), leaves=self.leaves.get(agent_id, ()))


async def organization_calendar(
    session: AsyncSession, organization_id: uuid.UUID
) -> OrganizationCalendar:
    organization = await session.get(Organization, organization_id)
    shifts = {
        s.id: Shift(s.name, s.start_time, s.end_time, tuple(s.weekdays))
        for s in await session.scalars(
            select(WorkShift).where(WorkShift.organization_id == organization_id)
        )
    }
    days = {
        d.date: (d.kind, d.name)
        for d in await session.scalars(
            select(CalendarDay).where(CalendarDay.organization_id == organization_id)
        )
    }
    leaves: dict[uuid.UUID, list] = {}
    rows = await session.execute(
        select(Agent.id, MemberLeave.start_date, MemberLeave.end_date)
        .join(MemberLeave, MemberLeave.member_id == Agent.owner_member_id)
        .where(Agent.organization_id == organization_id)
    )
    for agent_id, start, end in rows:
        leaves.setdefault(agent_id, []).append((start, end))
    return OrganizationCalendar(
        base=WorkCalendar(
            zone=ZoneInfo(organization.timezone),
            workdays=tuple(organization.workdays),
            days=days,
        ),
        shifts=shifts,
        leaves={agent: tuple(ranges) for agent, ranges in leaves.items()},
    )


def plan_next(
    schedule: Schedule, calendar: OrganizationCalendar, after: datetime.datetime | None = None
) -> None:
    """
    Tentukan putaran berikutnya sesudah `after`, yang sekaligus menjadi batas yang sudah
    diproses. Jadwal aktif tanpa putaran lagi menjadi berakhir.
    """
    schedule.cursor_at = schedule.check_at = schedule.next_run_at = None
    if schedule.status != "active":
        return
    rule = ScheduleRule.model_validate(schedule.rule)
    after = after or utcnow()
    items = occurrences(
        calendar.for_rule(rule, schedule.entry_agent_id), rule, after, 1, str(schedule.id)
    )
    moment = next((o.at for o in items if o.status == "run"), None)
    if moment is None:
        schedule.status = "ended"
        return
    # UTC, sama dengan yang dibaca kembali dari database (kontrak 1.1)
    schedule.cursor_at = after
    schedule.check_at = items[0].at.astimezone(datetime.UTC)
    schedule.next_run_at = moment.astimezone(datetime.UTC)


async def refresh_organization(session: AsyncSession, organization_id: uuid.UUID) -> None:
    """
    Hitung ulang putaran berikutnya sesudah kalender, cuti, atau zona waktu berubah.
    Putaran yang sudah jatuh tempo dibiarkan untuk penjadwal. Pemanggil yang menyimpan.
    """
    now = utcnow()
    schedules = (
        await session.scalars(
            select(Schedule)
            .where(Schedule.organization_id == organization_id, Schedule.status == "active")
            .with_for_update()
        )
    ).all()
    if not schedules:
        return
    calendar = await organization_calendar(session, organization_id)
    for schedule in schedules:
        if schedule.check_at is None or schedule.check_at > now:
            plan_next(schedule, calendar, now)
