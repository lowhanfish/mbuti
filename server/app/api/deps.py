"""Dependency FastAPI terpusat. Dependency pengguna dan keanggotaan ditambahkan di B1."""

from app.db.session import get_db

__all__ = ["get_db"]
