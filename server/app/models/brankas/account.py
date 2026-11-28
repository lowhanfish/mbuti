from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk


class VaultAccount(Base):
    """
    Akun aplikasi luar milik satu role (E4a). Kolom `*_encrypted` hanya dibuka oleh
    `services/vault`; password dan kunci authenticator tidak pernah dikirim ke klien.
    """

    __tablename__ = "vault_accounts"
    __table_args__ = (UniqueConstraint("agent_id", "name"),)

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(80), nullable=False)
    url_encrypted = Column(Text, nullable=False)
    # Larik JSON alamat lain yang diizinkan
    other_urls_encrypted = Column(Text, nullable=False)
    username_encrypted = Column(Text, nullable=False)
    password_encrypted = Column(Text, nullable=False)
    totp_encrypted = Column(Text, nullable=True)
    # Penanggung jawab saat disimpan atau dikonfirmasi; berbeda dari milik role berarti terkunci
    responsible_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    password_changed_at = Column(DateTime(timezone=True), nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    # Sesi masuk tersimpan (cookie dan penyimpanan peramban), terenkripsi (E4b)
    session_encrypted = Column(Text, nullable=True)
    # Gagal masuk 2 kali: tidak dipakai sampai password diganti atau dikonfirmasi
    login_blocked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()
    updated_at = updated_at()
    created_by = created_by()
