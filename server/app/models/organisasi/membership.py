from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk

ACCESS_ROLES = ("owner", "admin", "member", "viewer")
MEMBER_STATUSES = ("active", "invited", "disabled")


class Membership(Base):
    """Keanggotaan pengguna dalam organisasi beserta hak aksesnya."""

    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_memberships_organization_user"),
        CheckConstraint(f"access_role IN {ACCESS_ROLES}", name="access_role"),
        CheckConstraint(f"status IN {MEMBER_STATUSES}", name="status"),
    )

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    access_role = Column(String(10), nullable=False)
    # use_alter: units juga merujuk memberships (penanggung jawab)
    unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "units.id", ondelete="SET NULL", use_alter=True, name="fk_memberships_unit_id_units"
        ),
        nullable=True,
        index=True,
    )
    status = Column(String(10), nullable=False, default="active")
    joined_at = Column(DateTime(timezone=True), nullable=False)
    last_active_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()
