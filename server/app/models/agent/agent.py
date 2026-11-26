from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk

AGENT_STATUSES = ("draft", "active", "paused")


class Agent(Base):
    """Role AI. Disebut `agent` di kode karena "role" dipakai untuk hak akses pengguna."""

    __tablename__ = "agents"
    __table_args__ = (CheckConstraint(f"status IN {AGENT_STATUSES}", name="status"),)

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    unit_id = Column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name = Column(String(60), nullable=False)
    title = Column(String(100), nullable=False)
    goal = Column(String(500), nullable=False, default="")
    status = Column(String(10), nullable=False, default="draft")
    instructions = Column(String(8000), nullable=False, default="")
    input_spec = Column(JSONB, nullable=False, default=list)
    output_format = Column(String(10), nullable=False, default="text")
    output_template = Column(String(4000), nullable=False, default="")
    acceptance_criteria = Column(JSONB, nullable=False, default=list)
    knowledge_scope = Column(String(14), nullable=False, default="own")
    model_profile = Column(String(10), nullable=False, default="balanced")
    owner_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    avatar = Column(JSONB, nullable=False)
    # Ditandai terhapus agar namanya tetap ada di riwayat tugas
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()
