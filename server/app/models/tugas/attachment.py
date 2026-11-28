from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, uuid_pk


class TaskAttachment(Base):
    """
    Lampiran tugas atau uji coba: gambar, PDF, atau data (kontrak 16.6 dan 19.1). Diunggah
    sebelum tugas dibuat; yang tidak terpakai dibuang setelah `expires_at`.
    """

    __tablename__ = "task_attachments"

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_id = Column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    file_name = Column(String(200), nullable=False)
    # Berkas asli, relatif terhadap folder unggahan
    storage_path = Column(String(200), nullable=False)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False)
    width = Column(Integer, nullable=False, default=0)
    height = Column(Integer, nullable=False, default=0)
    # Gambar WebP tiap halaman (gambar = satu), relatif terhadap folder unggahan
    page_paths = Column(JSONB, nullable=False, default=list)
    exif = Column(JSONB, nullable=True)
    # Lembar data XLSX dan CSV: nama, kolom, jumlah baris, contoh baris
    tables = Column(JSONB, nullable=True)
    uploaded_by_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()
