from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk


class Document(Base):
    """SOP, manual, pedoman, atau dokumen lain beserta siapa yang boleh membacanya."""

    __tablename__ = "documents"
    __table_args__ = (
        # Pemilik harus sesuai lingkup; dokumen yang diarsipkan boleh kehilangan pemiliknya
        CheckConstraint(
            "deleted_at IS NOT NULL"
            " OR (scope = 'organization' AND unit_id IS NULL AND agent_id IS NULL)"
            " OR (scope = 'unit' AND unit_id IS NOT NULL AND agent_id IS NULL)"
            " OR (scope = 'agent' AND agent_id IS NOT NULL AND unit_id IS NULL)",
            name="scope",
        ),
        CheckConstraint(
            "category IN ('knowledge', 'policy', 'formation', 'qa', 'web')", name="category"
        ),
    )

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(200), nullable=False)
    description = Column(String(1000), nullable=False, default="")
    doc_type = Column(String(20), nullable=False, default="lainnya")
    # knowledge, policy (E1b), formation (uraian jabatan), qa (hasil tanya jawab), web (E1d)
    category = Column(String(12), nullable=False, default="knowledge", server_default="knowledge")
    scope = Column(String(12), nullable=False)
    unit_id = Column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"), nullable=True, index=True
    )
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Diisi bila dihapus setelah pernah dirujuk (mulai tahap B4)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()


class DocumentVersion(Base):
    """Satu berkas unggahan beserta keadaan olahnya."""

    __tablename__ = "document_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "version_no", name="uq_document_versions_number"),
        CheckConstraint("status IN ('queued', 'processing', 'ready', 'failed')", name="status"),
    )

    id = uuid_pk()
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_no = Column(Integer, nullable=False)
    file_name = Column(String(200), nullable=False)
    # Relatif terhadap folder unggahan; nama berkas dibuat acak
    storage_path = Column(String(200), nullable=False)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False)
    page_count = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=False)
    # Menggantikan versi aktif begitu selesai diolah
    activate_when_ready = Column(Boolean, nullable=False, default=False)
    status = Column(String(12), nullable=False, default="queued")
    progress = Column(Integer, nullable=False, default=0)
    error_message = Column(String(300), nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    uploaded_by_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    created_at = created_at()


Index(
    "uq_document_versions_active",
    DocumentVersion.document_id,
    unique=True,
    postgresql_where=text("is_active"),
)
# Berkas yang sama ditolak, kecuali percobaan sebelumnya gagal diolah
Index(
    "uq_document_versions_file",
    DocumentVersion.document_id,
    DocumentVersion.sha256,
    unique=True,
    postgresql_where=text("status <> 'failed'"),
)
