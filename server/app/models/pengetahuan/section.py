from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Computed, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID

from app.db.base import Base
from app.models.base import uuid_pk

# Ukuran vektor `gemini-embedding-2` yang dipakai; mengubahnya butuh olah ulang semua dokumen
EMBEDDING_DIMENSION = 768
SEARCH_EXPRESSION = "to_tsvector('indonesian'::regconfig, heading || ' ' || text)"
CHUNK_KINDS = ("text", "page_image")


class DocumentSection(Base):
    """Satu halaman (PDF) atau satu bagian berjudul; satuan yang dirujuk."""

    __tablename__ = "document_sections"

    id = uuid_pk()
    version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("document_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_no = Column(Integer, nullable=False)
    heading = Column(String(200), nullable=False)
    text = Column(Text, nullable=False)
    # text dibaca lokal; scan dan visual punya gambar halaman yang dibaca Gemini (E1c)
    render = Column(String(6), nullable=False, default="text", server_default="text")
    image_path = Column(String(200), nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    # Bacaan Gemini atas gambar halaman, disimpan saat pertama kali dipakai tugas
    visual_text = Column(Text, nullable=False, default="", server_default="")


class DocumentChunk(Base):
    """Potongan seksi untuk pencarian kata kunci dan kemiripan makna."""

    __tablename__ = "document_chunks"

    id = uuid_pk()
    section_id = Column(
        UUID(as_uuid=True),
        ForeignKey("document_sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("document_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # text, atau page_image: embedding multimodal satu halaman bergambar
    kind = Column(String(10), nullable=False, default="text", server_default="text")
    chunk_no = Column(Integer, nullable=False)
    # Judul seksi disalin agar ikut dalam pencarian kata kunci
    heading = Column(String(200), nullable=False)
    text = Column(Text, nullable=False)
    search = Column(TSVECTOR, Computed(SEARCH_EXPRESSION, persisted=True))
    embedding = Column(Vector(EMBEDDING_DIMENSION), nullable=True)


Index("ix_document_chunks_search", DocumentChunk.search, postgresql_using="gin")
Index(
    "ix_document_chunks_embedding",
    DocumentChunk.embedding,
    postgresql_using="hnsw",
    postgresql_ops={"embedding": "vector_cosine_ops"},
)
