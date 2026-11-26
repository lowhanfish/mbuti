from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, created_by, uuid_pk

TOKEN_PURPOSES = ("verify", "reset", "invite")


class AuthToken(Base):
    """
    Token sekali pakai di tautan email: verifikasi email, atur ulang kata sandi, dan undangan.
    Hanya hash-nya yang disimpan; token asli hanya ada di email.
    """

    __tablename__ = "auth_tokens"
    __table_args__ = (CheckConstraint(f"purpose IN {TOKEN_PURPOSES}", name="purpose"),)

    id = uuid_pk()
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    purpose = Column(String(10), nullable=False)
    # Hanya untuk undangan: keanggotaan yang diterima lewat tautan ini
    membership_id = Column(
        UUID(as_uuid=True),
        ForeignKey("memberships.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # SHA-256 dari token
    token_hash = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    # Diisi saat dipakai, atau saat diganti token baru dengan tujuan yang sama
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()
    # Pengirim undangan
    created_by = created_by()
