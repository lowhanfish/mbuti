from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import updated_at


class OrganizationSettings(Base):
    """Pilihan model dan pengaman biaya. Organisasi tanpa baris memakai nilai bawaan."""

    __tablename__ = "organization_settings"

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    # {"fast": ..., "balanced": ..., "thorough": ..., "fallback": ...}; kosong = nilai server
    models = Column(JSONB, nullable=True)
    monthly_budget = Column(Integer, nullable=False)
    default_task_budget = Column(Integer, nullable=False)
    max_steps_per_task = Column(Integer, nullable=False)
    max_revisions = Column(Integer, nullable=False)
    updated_at = updated_at()
