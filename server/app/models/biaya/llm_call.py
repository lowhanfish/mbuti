from sqlalchemy import Column, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.base import created_at, created_by, uuid_pk


class LlmCall(Base):
    """Satu panggilan model beserta biayanya; dasar hitungan anggaran bulanan."""

    __tablename__ = "llm_calls"

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    # Langkah tugas (B5); kosong untuk uji coba
    step_id = Column(UUID(as_uuid=True), nullable=True)
    kind = Column(String(10), nullable=False)
    provider = Column(String(20), nullable=False)
    model = Column(String(60), nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    # Rupiah
    cost = Column(Integer, nullable=False, default=0)
    latency_ms = Column(Integer, nullable=False, default=0)
    # ok atau error
    status = Column(String(10), nullable=False)
    created_at = created_at()
    created_by = created_by()


Index("ix_llm_calls_organization_created", LlmCall.organization_id, LlmCall.created_at)
