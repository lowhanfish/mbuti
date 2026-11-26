from sqlalchemy import Column, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk


class Unit(Base):
    """Unit atau divisi, bisa bertingkat."""

    __tablename__ = "units"

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id = Column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    name = Column(String(120), nullable=False)
    code = Column(String(12), nullable=False, default="")
    description = Column(String(1000), nullable=False, default="")
    color = Column(String(10), nullable=False, default="violet")
    lead_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()


# Nama unik tanpa membedakan huruf besar; kode unik hanya bila diisi
Index("uq_units_organization_name", Unit.organization_id, func.lower(Unit.name), unique=True)
Index(
    "uq_units_organization_code",
    Unit.organization_id,
    Unit.code,
    unique=True,
    postgresql_where=text("code <> ''"),
)
