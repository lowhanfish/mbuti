from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, uuid_pk


class KnowledgeProposal(Base):
    """Usulan menyimpan temuan internet sebagai pengetahuan organisasi (kontrak 16.7)."""

    __tablename__ = "knowledge_proposals"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="status"),
    )

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url = Column(String(500), nullable=False)
    title = Column(String(200), nullable=False)
    excerpt = Column(String(2000), nullable=False, default="")
    status = Column(String(10), nullable=False, default="pending")
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    proposed_by_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    decided_by_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    decided_at = Column(DateTime(timezone=True), nullable=True)
    document_id = Column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    created_at = created_at()


# Satu usulan yang menunggu per alamat per organisasi
Index(
    "uq_knowledge_proposals_pending",
    KnowledgeProposal.organization_id,
    KnowledgeProposal.url,
    unique=True,
    postgresql_where=text("status = 'pending'"),
)
