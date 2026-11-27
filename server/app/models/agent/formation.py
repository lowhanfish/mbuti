"""Pembentukan role (fase E1a): revisi, keterampilan, tanya jawab, dan permintaan alat."""

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
from app.models.base import created_at, created_by, updated_at, uuid_pk

REVISION_STATUSES = (
    "draft",
    "analyzing",
    "questioning",
    "ready",
    "final",
    "superseded",
    "discarded",
)
OPEN_REVISION_STATUSES = ("draft", "analyzing", "questioning", "ready")
REVISION_SOURCES = ("formation", "manual", "restore")
TOOL_SUPPORTS = ("supported", "upcoming", "substitute", "unsupported")


class AgentRevision(Base):
    """
    Satu versi role. Kartu (`card`: ringkasan, tujuan, temuan) dan isian kerja (`snapshot`)
    disimpan per revisi; keterampilannya di `agent_skills`. Final menyalin `snapshot` ke `agents`.
    """

    __tablename__ = "agent_revisions"
    __table_args__ = (
        UniqueConstraint("agent_id", "version_no", name="uq_agent_revisions_number"),
        CheckConstraint(f"status IN {REVISION_STATUSES}", name="status"),
        CheckConstraint(f"source IN {REVISION_SOURCES}", name="source"),
        CheckConstraint("job IS NULL OR job IN ('analysis', 'round')", name="job"),
    )

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
    version_no = Column(Integer, nullable=False)
    status = Column(String(12), nullable=False)
    source = Column(String(10), nullable=False)
    # description, tools, represented, owner_member_id
    materials = Column(JSONB, nullable=False, default=dict)
    # summary, goal, findings; kosong sebelum analisis
    card = Column(JSONB, nullable=True)
    snapshot = Column(JSONB, nullable=False)
    round_no = Column(Integer, nullable=False, default=0)
    # Bagian kartu yang berubah pada putaran terakhir
    changed = Column(JSONB, nullable=False, default=list)
    agent_satisfied = Column(Boolean, nullable=False, default=False)
    change_note = Column(String(1000), nullable=False, default="")
    # Pekerjaan latar yang sedang berjalan: analysis atau round
    job = Column(String(10), nullable=True)
    # Putaran ini diminta berakhir ("Cukup, ke Final")
    job_finish = Column(Boolean, nullable=False, default=False)
    job_started_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(String(300), nullable=True)
    finalized_at = Column(DateTime(timezone=True), nullable=True)
    finalized_by_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()


# Paling banyak satu revisi terbuka per role
Index(
    "uq_agent_revisions_open",
    AgentRevision.agent_id,
    unique=True,
    postgresql_where=text(f"status IN {OPEN_REVISION_STATUSES}"),
)


class AgentSkill(Base):
    """Satu keterampilan pada kartu sebuah revisi."""

    __tablename__ = "agent_skills"
    __table_args__ = (
        UniqueConstraint("revision_id", "key", name="uq_agent_skills_key"),
        CheckConstraint(f"support IN {TOOL_SUPPORTS}", name="support"),
    )

    id = uuid_pk()
    revision_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agent_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    key = Column(String(40), nullable=False)
    name = Column(String(120), nullable=False)
    description = Column(String(600), nullable=False, default="")
    # [{text, approval}]
    steps = Column(JSONB, nullable=False, default=list)
    inputs = Column(JSONB, nullable=False, default=list)
    outputs = Column(JSONB, nullable=False, default=list)
    # [{key, requested, name, support, note}]
    tools = Column(JSONB, nullable=False, default=list)
    support = Column(String(12), nullable=False, default="supported")
    substitute_note = Column(String(400), nullable=False, default="")
    sort_order = Column(Integer, nullable=False, default=0)


class AgentFormationMessage(Base):
    """Pertanyaan, jawaban, keberatan, dan catatan dalam tanya jawab pembentukan."""

    __tablename__ = "agent_formation_messages"
    __table_args__ = (
        CheckConstraint("author IN ('agent', 'member')", name="author"),
        CheckConstraint("kind IN ('question', 'answer', 'objection', 'note')", name="kind"),
    )

    id = uuid_pk()
    revision_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agent_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    round_no = Column(Integer, nullable=False)
    author = Column(String(10), nullable=False)
    kind = Column(String(10), nullable=False)
    # Untuk jawaban: pertanyaan yang dijawab
    question_id = Column(UUID(as_uuid=True), nullable=True)
    required = Column(Boolean, nullable=False, default=False)
    text = Column(Text, nullable=False)
    skipped = Column(Boolean, nullable=False, default=False)
    # Rujukan ke uraian jabatan, mis. ["Uraian jabatan, hlm. 2"]
    refs = Column(JSONB, nullable=False, default=list)
    author_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    created_at = created_at()


class ToolRequest(Base):
    """Alat yang disebut pembuat role tetapi belum ada di katalog; dibaca pengelola platform."""

    __tablename__ = "tool_requests"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'planned', 'done', 'declined')", name="status"),
    )

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    revision_id = Column(
        UUID(as_uuid=True), ForeignKey("agent_revisions.id", ondelete="SET NULL"), nullable=True
    )
    skill_name = Column(String(120), nullable=False)
    requested = Column(String(80), nullable=False)
    status = Column(String(10), nullable=False, default="open")
    created_at = created_at()
