from sqlalchemy import Boolean, Column, DateTime, String

from app.db.base import Base
from app.models.base import created_at, updated_at, uuid_pk


class User(Base):
    """Akun manusia. Peran dalam organisasi ada di `memberships`."""

    __tablename__ = "users"

    id = uuid_pk()
    # Selalu disimpan huruf kecil
    email = Column(String(150), nullable=False, unique=True)
    # Kosong untuk orang yang diundang dan belum membuat kata sandi
    password_hash = Column(String(255), nullable=True)
    full_name = Column(String(150), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    is_verified = Column(Boolean, nullable=False, default=False)
    # Diisi saat mendaftar sendiri (menyetujui ketentuan layanan dan kebijakan privasi)
    terms_accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = created_at()
    updated_at = updated_at()
