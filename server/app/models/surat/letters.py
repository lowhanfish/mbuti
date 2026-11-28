from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk


def _reference(table: str, on_delete: str, nullable: bool = False, index: bool = False) -> Column:
    return Column(
        UUID(as_uuid=True),
        ForeignKey(f"{table}.id", ondelete=on_delete),
        nullable=nullable,
        index=index,
    )


class LetterFormat(Base):
    """Catatan format satu jenis naskah milik organisasi (kontrak 18.3)."""

    __tablename__ = "letter_formats"

    id = uuid_pk()
    organization_id = _reference("organizations", "CASCADE")
    name = Column(String(60), nullable=False)
    # Kertas, margin, huruf, susunan bagian, dan letaknya
    spec = Column(JSONB, nullable=False)
    sources = Column(JSONB, nullable=False, default=list)
    # Hal yang perlu diperiksa, mis. contoh yang berbeda dari aturan
    notes = Column(JSONB, nullable=False, default=list)
    number_pattern = Column(String(80), nullable=True)
    checked = Column(Boolean, nullable=False, default=False)
    corrections = Column(JSONB, nullable=False, default=list)
    created_at = created_at()
    updated_at = updated_at()


Index(
    "uq_letter_formats_name",
    LetterFormat.organization_id,
    func.lower(LetterFormat.name),
    unique=True,
)


class Letterhead(Base):
    """Gambar kop; satu per organisasi atau unit."""

    __tablename__ = "letterheads"

    id = uuid_pk()
    organization_id = _reference("organizations", "CASCADE", index=True)
    unit_id = _reference("units", "CASCADE", nullable=True)
    path = Column(String(200), nullable=False)
    created_at = created_at()
    created_by = created_by()


class LetterSample(Base):
    """Contoh surat Word yang ditiru tampilannya."""

    __tablename__ = "letter_samples"

    id = uuid_pk()
    organization_id = _reference("organizations", "CASCADE", index=True)
    file_name = Column(String(200), nullable=False)
    path = Column(String(200), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = created_at()
    created_by = created_by()


class LetterRegister(Base):
    """Buku register nomor satu jenis naskah."""

    __tablename__ = "letter_registers"

    id = uuid_pk()
    organization_id = _reference("organizations", "CASCADE")
    name = Column(String(60), nullable=False)
    pattern = Column(String(80), nullable=False)
    next_number = Column(Integer, nullable=False, default=1)
    # Tahun berjalan urutan; berganti tahun kembali ke 1
    year = Column(Integer, nullable=False)
    created_at = created_at()
    updated_at = updated_at()


Index(
    "uq_letter_registers_name",
    LetterRegister.organization_id,
    func.lower(LetterRegister.name),
    unique=True,
)


class LetterNumber(Base):
    """Nomor yang sudah terbit; tidak dipakai ulang."""

    __tablename__ = "letter_numbers"
    __table_args__ = (
        UniqueConstraint("register_id", "number", name="uq_letter_numbers_register_number"),
    )

    id = uuid_pk()
    register_id = _reference("letter_registers", "CASCADE")
    number = Column(String(120), nullable=False)
    task_id = _reference("tasks", "SET NULL", nullable=True)
    title = Column(String(150), nullable=False)
    issued_at = Column(DateTime(timezone=True), nullable=False)


class ResultDocument(Base):
    """Berkas hasil tugas: isi dari role, berkasnya dibuat program (kontrak 18.1)."""

    __tablename__ = "result_documents"
    __table_args__ = (
        UniqueConstraint("task_id", "agent_id", "kind", name="uq_result_documents_task_agent"),
    )

    id = uuid_pk()
    organization_id = _reference("organizations", "CASCADE", index=True)
    task_id = _reference("tasks", "CASCADE")
    agent_id = _reference("agents", "SET NULL", nullable=True)
    format_id = _reference("letter_formats", "SET NULL", nullable=True)
    # letter atau sheet (E3b)
    kind = Column(String(10), nullable=False, default="letter", server_default="letter")
    # Kosong untuk spreadsheet
    letter_type = Column(String(60), nullable=False)
    title = Column(String(150), nullable=False)
    content = Column(JSONB, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    number = Column(String(120), nullable=True)
    docx_path = Column(String(200), nullable=True)
    pdf_path = Column(String(200), nullable=True)
    page_paths = Column(JSONB, nullable=False, default=list)
    # Spreadsheet: berkas Excel dan pratinjau tiap lembar
    xlsx_path = Column(String(200), nullable=True)
    preview = Column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    # Salinan format saat berkas dibuat, agar perubahan format tidak mengubah berkas lama
    spec = Column(JSONB, nullable=True)
    sources = Column(JSONB, nullable=False, default=list)
    checks = Column(JSONB, nullable=False, default=list)
    needs_render = Column(Boolean, nullable=False, default=True)
    created_at = created_at()
    updated_at = updated_at()
