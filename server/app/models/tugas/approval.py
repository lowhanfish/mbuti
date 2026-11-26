from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Identity, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, uuid_pk


class Approval(Base):
    """Keputusan manusia pada satu titik tugas."""

    __tablename__ = "approvals"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected', 'revise')", name="status"),
    )

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
    reason = Column(String(20), nullable=False)
    question = Column(String(1000), nullable=False)
    requested_from_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    status = Column(String(10), nullable=False, default="pending", index=True)
    comment = Column(String(1000), nullable=False, default="")
    # Apa yang dilakukan setelah diputuskan, mis. menjalankan relasi yang ditahan
    follow_up = Column(JSONB, nullable=False, default=dict)
    decided_by_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    decided_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()
