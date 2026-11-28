from sqlalchemy import CheckConstraint, Column, String, text
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base
from app.models.base import created_at, updated_at, uuid_pk

ORGANIZATION_STATUSES = ("pending", "active", "suspended")
# 1 = Senin … 7 = Minggu
DEFAULT_WORKDAYS = (1, 2, 3, 4, 5)


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (CheckConstraint(f"status IN {ORGANIZATION_STATUSES}", name="status"),)

    id = uuid_pk()
    name = Column(String(150), nullable=False)
    slug = Column(String(160), nullable=False, unique=True)
    description = Column(String(1000), nullable=False, default="")
    sector = Column(String(20), nullable=False, default="lainnya")
    # pending: mendaftar sendiri dan menunggu persetujuan pengelola; suspended: ditangguhkan
    status = Column(String(10), nullable=False, default="active", server_default="active")
    timezone = Column(String(60), nullable=False, default="Asia/Makassar")
    # Hari kerja dalam seminggu; libur dan shift diatur di tabel kalender
    workdays = Column(
        JSONB,
        nullable=False,
        default=lambda: list(DEFAULT_WORKDAYS),
        server_default=text("'[1, 2, 3, 4, 5]'"),
    )
    email = Column(String(150), nullable=False, default="")
    phone = Column(String(30), nullable=False, default="")
    address = Column(String(300), nullable=False, default="")
    website = Column(String(200), nullable=False, default="")
    created_at = created_at()
    updated_at = updated_at()
