from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, updated_at, uuid_pk

FLOW_STATUSES = ("learning", "review", "approved", "needs_repair", "failed")
RUN_MODES = ("learn", "replay", "repair")
RUN_STATUSES = (
    "queued",
    "running",
    "waiting_approval",
    "waiting_otp",
    "succeeded",
    "failed",
    "stopped",
    "needs_repair",
)
# Putaran yang belum selesai; satu alur hanya boleh punya satu
ACTIVE_RUN_STATUSES = ("queued", "running", "waiting_approval", "waiting_otp")


def _list() -> Column:
    return Column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))


def _member() -> Column:
    return Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )


class BrowserFlow(Base):
    """Satu pekerjaan di aplikasi luar yang sudah dipelajari role (E4b)."""

    __tablename__ = "browser_flows"
    __table_args__ = (CheckConstraint(f"status IN {FLOW_STATUSES}", name="status"),)

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vault_accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = Column(String(100), nullable=False)
    goal = Column(String(1000), nullable=False)
    status = Column(String(12), nullable=False, default="learning")
    version = Column(Integer, nullable=False, default=1)
    # [{key, label, sample}]
    inputs = _list()
    # Langkah hasil belajar; bentuknya di services/browser/steps.py
    steps = _list()
    note = Column(String(500), nullable=False, default="")
    # Kirim tanpa persetujuan; hapus tetap selalu menunggu
    trusted_submit = Column(Boolean, nullable=False, default=False)
    successful_runs = Column(Integer, nullable=False, default=0)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by_member_id = _member()
    created_by_member_id = _member()
    created_at = created_at()
    updated_at = updated_at()


class BrowserRun(Base):
    """Satu kali belajar atau memutar ulang alur."""

    __tablename__ = "browser_runs"
    __table_args__ = (
        CheckConstraint(f"status IN {RUN_STATUSES}", name="status"),
        CheckConstraint(f"mode IN {RUN_MODES}", name="mode"),
    )

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    flow_id = Column(
        UUID(as_uuid=True),
        ForeignKey("browser_flows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Terisi untuk putaran milik tugas (E4c)
    task_id = Column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Hasil tugasnya berisi buatan role: tetap minta persetujuan walau alurnya dibebaskan
    force_approval = Column(Boolean, nullable=False, default=False, server_default="false")
    mode = Column(String(8), nullable=False)
    status = Column(String(20), nullable=False, default="queued")
    message = Column(String(500), nullable=False, default="")
    flow_version = Column(Integer, nullable=False)
    # {key: nilai}
    inputs = Column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    # [{label, value}] yang dibaca dari halaman
    outputs = _list()
    # Pertanyaan yang sedang menunggu manusia (persetujuan atau OTP)
    pending = Column(JSONB, nullable=True)
    approved_step = Column(Integer, nullable=True)
    approved_by_member_id = _member()
    # Kode OTP titipan pemilik; terenkripsi dan dihapus begitu dipakai
    otp_encrypted = Column(Text, nullable=True)
    # Diisi tepat sebelum tombol berisiko ditekan: putaran ini tidak boleh diulang otomatis
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    # Kosong untuk putaran yang dibuat sistem (perbaikan otomatis)
    created_by_member_id = _member()
    created_at = created_at()
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    # Tanda hidup dari worker
    claimed_at = Column(DateTime(timezone=True), nullable=True)


Index("ix_browser_runs_status", BrowserRun.status)


class BrowserRunEvent(Base):
    """Catatan putaran beserta bukti tangkapan layarnya."""

    __tablename__ = "browser_run_events"
    __table_args__ = (UniqueConstraint("run_id", "no"),)

    id = uuid_pk()
    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("browser_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    no = Column(Integer, nullable=False)
    step_no = Column(Integer, nullable=True)
    message = Column(String(500), nullable=False)
    # done, waiting, blocked, failed
    status = Column(String(8), nullable=False)
    has_screenshot = Column(Boolean, nullable=False, default=False)
    created_at = created_at()
