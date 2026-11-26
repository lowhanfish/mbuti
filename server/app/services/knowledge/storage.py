"""Berkas unggahan di disk. Tidak dilayani sebagai folder statis; selalu lewat endpoint."""

import uuid
from pathlib import Path

from app.core.config import settings


def _root() -> Path:
    return settings.UPLOAD_DIR.resolve()


def path_of(relative: str) -> Path:
    path = (_root() / relative).resolve()
    if not path.is_relative_to(_root()):
        raise ValueError("Alamat berkas di luar folder unggahan.")
    return path


def save(organization_id: uuid.UUID, extension: str, data: bytes) -> str:
    """Simpan dengan nama acak; kembalikan alamat relatif."""
    relative = f"{organization_id}/{uuid.uuid4().hex}.{extension}"
    path = path_of(relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return relative


def delete(relative: str) -> None:
    path_of(relative).unlink(missing_ok=True)
