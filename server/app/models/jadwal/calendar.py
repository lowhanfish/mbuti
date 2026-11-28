from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Index,
    String,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk

DAY_KINDS = ("holiday", "workday")


def _organization_id(index: bool = True) -> Column:
    return Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=index,
    )


class WorkShift(Base):
    """Shift kerja milik organisasi. Jam selesai lebih kecil berarti melewati tengah malam."""

    __tablename__ = "work_shifts"
    __table_args__ = (CheckConstraint("start_time <> end_time", name="times"),)

    id = uuid_pk()
    organization_id = _organization_id()
    name = Column(String(60), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    # 1 = Senin … 7 = Minggu
    weekdays = Column(JSONB, nullable=False)
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()


Index(
    "uq_work_shifts_organization_name",
    WorkShift.organization_id,
    func.lower(WorkShift.name),
    unique=True,
)


class CalendarDay(Base):
    """Tanggal khusus: libur atau hari kerja pengganti. Satu per tanggal per organisasi."""

    __tablename__ = "calendar_days"
    __table_args__ = (
        UniqueConstraint("organization_id", "date", name="uq_calendar_days_organization_date"),
        CheckConstraint(f"kind IN {DAY_KINDS}", name="kind"),
    )

    id = uuid_pk()
    # Indeks unik (organization_id, date) sudah mencakup pencarian per organisasi
    organization_id = _organization_id(index=False)
    date = Column(Date, nullable=False)
    kind = Column(String(10), nullable=False)
    name = Column(String(120), nullable=False)
    # Jenis bebas milik organisasi, mis. "Libur nasional"
    label = Column(String(60), nullable=False, default="")
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()


class MemberLeave(Base):
    """Cuti anggota; kedua tanggalnya termasuk."""

    __tablename__ = "member_leaves"
    __table_args__ = (CheckConstraint("end_date >= start_date", name="dates"),)

    id = uuid_pk()
    organization_id = _organization_id()
    member_id = Column(
        UUID(as_uuid=True),
        ForeignKey("memberships.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    note = Column(String(200), nullable=False, default="")
    created_at = created_at()
    created_by = created_by()
