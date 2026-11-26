from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at


class FlowHuman(Base):
    """Manusia yang ditampilkan di peta relasi."""

    __tablename__ = "flow_humans"

    member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="CASCADE"), primary_key=True
    )
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = created_at()


class FlowPosition(Base):
    """Posisi node (role atau manusia) di peta, dipakai bersama satu organisasi."""

    __tablename__ = "flow_positions"

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    # Bisa ID role atau ID keanggotaan, jadi tanpa kunci asing
    node_id = Column(UUID(as_uuid=True), primary_key=True)
    x = Column(Integer, nullable=False)
    y = Column(Integer, nullable=False)
