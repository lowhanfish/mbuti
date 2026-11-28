from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk

SCHEDULE_STATUSES = ("draft", "active", "paused", "ended")
# scheduled: dari jadwal; backfill: susulan otomatis; manual: dijalankan pengguna
RUN_ORIGINS = ("scheduled", "backfill", "manual")
RUN_STATUSES = (
    "scheduled",
    "created",
    "skipped_holiday",
    "skipped_leave",
    "missed",
    "failed",
    "retrying",
    "backfill",
    "skipped",
    "stopped_budget",
)


class Schedule(Base):
    """Templat tugas rutin beserta aturan jadwalnya (kontrak 17.3)."""

    __tablename__ = "schedules"
    __table_args__ = (CheckConstraint(f"status IN {SCHEDULE_STATUSES}", name="status"),)

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entry_agent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(150), nullable=False)
    brief = Column(String(4000), nullable=False, default="")
    inputs = Column(JSONB, nullable=False, default=dict)
    priority = Column(String(6), nullable=False, default="normal")
    budget_limit = Column(Integer, nullable=False)
    web_search = Column(String(4), nullable=False, default="role")
    rule = Column(JSONB, nullable=False)
    # Salinan rule.shift_id agar shift yang dipakai tidak bisa dihapus
    shift_id = Column(
        UUID(as_uuid=True),
        ForeignKey("work_shifts.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    source_text = Column(String(500), nullable=False, default="")
    status = Column(String(10), nullable=False, default="draft")
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    # Putaran sampai saat ini sudah diproses penjadwal
    cursor_at = Column(DateTime(timezone=True), nullable=True)
    # Kejadian terdekat (jalan atau dilewati) yang perlu diproses
    check_at = Column(DateTime(timezone=True), nullable=True)
    created_by_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()


# Dipakai penjadwal untuk mengambil jadwal jatuh tempo
Index("ix_schedules_due", Schedule.status, Schedule.check_at)


class ScheduleRun(Base):
    """Satu putaran tugas rutin, termasuk yang dilewati (kontrak 17.6)."""

    __tablename__ = "schedule_runs"
    __table_args__ = (
        CheckConstraint(f"origin IN {RUN_ORIGINS}", name="origin"),
        CheckConstraint(f"status IN {RUN_STATUSES}", name="status"),
    )

    id = uuid_pk()
    schedule_id = Column(
        UUID(as_uuid=True), ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False
    )
    planned_for = Column(DateTime(timezone=True), nullable=False)
    origin = Column(String(10), nullable=False)
    status = Column(String(16), nullable=False)
    attempt = Column(Integer, nullable=False, default=1)
    reason = Column(String(300), nullable=False, default="")
    # Tugas percobaan terakhir
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    # Saat penjadwal harus bertindak: susulan yang menunggu atau coba ulang
    due_at = Column(DateTime(timezone=True), nullable=True)
    # Benar selama hasil tugasnya belum diketahui
    watching = Column(Boolean, nullable=False, default=False)
    # Putaran asal sebuah susulan otomatis
    source_id = Column(
        UUID(as_uuid=True), ForeignKey("schedule_runs.id", ondelete="SET NULL"), nullable=True
    )
    created_at = created_at()
    updated_at = updated_at()


Index("ix_schedule_runs_schedule", ScheduleRun.schedule_id, ScheduleRun.planned_for)
# Satu jadwal tidak menghasilkan dua putaran untuk saat yang sama
Index(
    "uq_schedule_runs_planned",
    ScheduleRun.schedule_id,
    ScheduleRun.planned_for,
    unique=True,
    postgresql_where=text("origin = 'scheduled'"),
)
Index("ix_schedule_runs_due", ScheduleRun.due_at, postgresql_where=text("due_at IS NOT NULL"))
Index("ix_schedule_runs_watching", ScheduleRun.task_id, postgresql_where=text("watching"))
