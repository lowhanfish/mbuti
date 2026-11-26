from sqlalchemy import Column, ForeignKey, Identity, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, uuid_pk


class AuditLog(Base):
    """Siapa melakukan apa. Hanya ditambah, tidak pernah diubah."""

    __tablename__ = "audit_logs"

    id = uuid_pk()
    seq = Column(Integer, Identity(), nullable=False)
    # Kosong untuk percobaan masuk dengan email yang tidak dikenal
    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Disalin agar riwayat tetap terbaca setelah akun diubah atau dihapus
    actor_name = Column(String(150), nullable=False, default="")
    actor_email = Column(String(255), nullable=False, default="")
    action = Column(String(40), nullable=False)
    target = Column(String(200), nullable=False, default="")
    ip = Column(String(45), nullable=False, default="")
    request_id = Column(String(36), nullable=False, default="")
    created_at = created_at()


Index("ix_audit_logs_organization_seq", AuditLog.organization_id, AuditLog.seq)
