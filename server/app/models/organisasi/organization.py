from sqlalchemy import Column, String

from app.db.base import Base
from app.models.base import created_at, updated_at, uuid_pk


class Organization(Base):
    __tablename__ = "organizations"

    id = uuid_pk()
    name = Column(String(150), nullable=False)
    slug = Column(String(160), nullable=False, unique=True)
    description = Column(String(1000), nullable=False, default="")
    sector = Column(String(20), nullable=False, default="lainnya")
    timezone = Column(String(60), nullable=False, default="Asia/Makassar")
    email = Column(String(150), nullable=False, default="")
    phone = Column(String(30), nullable=False, default="")
    address = Column(String(300), nullable=False, default="")
    website = Column(String(200), nullable=False, default="")
    created_at = created_at()
    updated_at = updated_at()
