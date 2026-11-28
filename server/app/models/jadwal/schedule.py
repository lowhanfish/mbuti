from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk

SCHEDULE_STATUSES = ("draft", "active", "paused", "ended")


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
    created_by_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()


# Dipakai penjadwal untuk mengambil jadwal jatuh tempo
Index("ix_schedules_due", Schedule.status, Schedule.next_run_at)
