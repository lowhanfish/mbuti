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
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk

RELATION_TYPES = ("handoff", "review", "consult", "escalate")


class AgentRelation(Base):
    """Garis di peta relasi: dari role ke role lain, atau ke manusia (eskalasi)."""

    __tablename__ = "agent_relations"
    __table_args__ = (
        CheckConstraint(f"relation_type IN {RELATION_TYPES}", name="relation_type"),
        # Relasi aktif punya tepat satu tujuan; yang terhapus boleh kehilangan tujuannya
        CheckConstraint(
            "deleted_at IS NOT NULL OR num_nonnulls(target_agent_id, target_member_id) = 1",
            name="target",
        ),
    )

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True, index=True
    )
    target_member_id = Column(
        UUID(as_uuid=True),
        ForeignKey("memberships.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    relation_type = Column(String(10), nullable=False)
    trigger = Column(String(14), nullable=False, default="on_complete")
    condition = Column(String(500), nullable=False, default="")
    payload_spec = Column(String(16), nullable=False, default="result_context")
    expected_output = Column(String(500), nullable=False, default="")
    max_revisions = Column(Integer, nullable=False, default=2)
    requires_approval = Column(Boolean, nullable=False, default=False)
    label = Column(String(60), nullable=False, default="")
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()


# Satu jenis relasi di antara dua pihak, hanya untuk relasi yang masih aktif
Index(
    "uq_agent_relations_agent_target",
    AgentRelation.source_agent_id,
    AgentRelation.target_agent_id,
    AgentRelation.relation_type,
    unique=True,
    postgresql_where=text("deleted_at IS NULL AND target_agent_id IS NOT NULL"),
)
Index(
    "uq_agent_relations_member_target",
    AgentRelation.source_agent_id,
    AgentRelation.target_member_id,
    AgentRelation.relation_type,
    unique=True,
    postgresql_where=text("deleted_at IS NULL AND target_member_id IS NOT NULL"),
)
