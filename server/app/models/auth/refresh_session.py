from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, uuid_pk


class RefreshSession(Base):
    """
    Satu token refresh. Token diganti setiap dipakai; semua token dari satu kali masuk
    berbagi `family_id`, sehingga satu sesi bisa dicabut seluruhnya.
    """

    __tablename__ = "refresh_sessions"

    id = uuid_pk()
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    family_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    # SHA-256 dari token; token asli hanya ada di cookie peramban
    token_hash = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    # rotated, logout, reuse, disabled
    revoked_reason = Column(String(20), nullable=True)
    user_agent = Column(String(255), nullable=True)
    ip = Column(String(45), nullable=True)
    created_at = created_at()
