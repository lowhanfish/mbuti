from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, updated_at


class UserTwoFactor(Base):
    """Verifikasi dua langkah satu akun (E4a). Tanpa `enabled_at` berarti belum dikonfirmasi."""

    __tablename__ = "user_two_factors"

    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # Kunci TOTP terenkripsi
    secret_encrypted = Column(Text, nullable=False)
    enabled_at = Column(DateTime(timezone=True), nullable=True)
    # Putaran waktu terakhir yang dipakai, agar satu kode tidak berlaku dua kali
    last_step = Column(BigInteger, nullable=True)
    # Sidik jari kode cadangan yang belum dipakai
    recovery_hashes = Column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    created_at = created_at()
    updated_at = updated_at()
