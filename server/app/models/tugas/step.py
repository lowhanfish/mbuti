from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, uuid_pk

STEP_STATUSES = ("queued", "running", "done", "revise_requested", "failed", "skipped")


class TaskStep(Base):
    """Satu kali kerja sebuah role dalam satu tugas."""

    __tablename__ = "task_steps"
    __table_args__ = (CheckConstraint(f"status IN {STEP_STATUSES}", name="status"),)

    id = uuid_pk()
    # Urutan pembuatan, untuk menampilkan langkah secara tetap
    seq = Column(Integer, Identity(), nullable=False)
    task_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind = Column(String(10), nullable=False)
    via_relation_id = Column(
        UUID(as_uuid=True), ForeignKey("agent_relations.id", ondelete="SET NULL"), nullable=True
    )
    parent_step_id = Column(
        UUID(as_uuid=True), ForeignKey("task_steps.id", ondelete="SET NULL"), nullable=True
    )
    attempt_no = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="queued")
    # Urutan antrean; kosong berarti ditahan menunggu izin
    queue_no = Column(Float, nullable=True)
    consults_expanded = Column(Boolean, nullable=False, default=False)
    # Percobaan menjalankan model untuk langkah ini
    tries = Column(Integer, nullable=False, default=0)
    input_notes = Column(Text, nullable=False, default="")
    output = Column(Text, nullable=False, default="")
    # Temuan atas gambar (E1c), bentuk `Finding` di kontrak 16.6
    findings = Column(JSONB, nullable=False, default=list, server_default="[]")
    # Sumber internet yang dipakai (E1d), bentuk `WebSource` di kontrak 16.7
    web_sources = Column(JSONB, nullable=False, default=list, server_default="[]")
    # Mode penyusunan yang dipakai dan bagian buatan role (E3c); hanya pada langkah kerja
    compose_mode = Column(String(8), nullable=True)
    composed = Column(JSONB, nullable=False, default=list, server_default="[]")
    verdict = Column(String(10), nullable=True)
    model = Column(String(60), nullable=False, default="")
    cost = Column(Integer, nullable=False, default=0)
    tokens = Column(Integer, nullable=False, default=0)
    error_code = Column(String(40), nullable=True)
    # Saat terakhir diambil worker; dipakai mengenali langkah yang ditinggalkan
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()


class Citation(Base):
    """Rujukan sebuah hasil ke halaman pada versi dokumen yang dipakai."""

    __tablename__ = "citations"

    id = uuid_pk()
    step_id = Column(
        UUID(as_uuid=True),
        ForeignKey("task_steps.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Dokumen yang dirujuk hanya diarsipkan, tidak dihapus
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("document_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_no = Column(Integer, nullable=False)
    document_title = Column(String(200), nullable=False)
    version_no = Column(Integer, nullable=False)
    page_no = Column(Integer, nullable=False)
    heading = Column(String(200), nullable=False)
    snippet = Column(String(400), nullable=False)
    score = Column(Integer, nullable=False)
    # policy, qa, atau document saat dirujuk (kontrak 16.4)
    source_kind = Column(String(12), nullable=False, default="document", server_default="document")


class TaskEvent(Base):
    """Peristiwa linimasa."""

    __tablename__ = "task_events"

    id = uuid_pk()
    seq = Column(Integer, Identity(), nullable=False)
    task_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_id = Column(
        UUID(as_uuid=True), ForeignKey("task_steps.id", ondelete="CASCADE"), nullable=True
    )
    type = Column(String(30), nullable=False)
    message = Column(String(1000), nullable=False)
    created_at = created_at()
