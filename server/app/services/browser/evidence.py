"""Tangkapan layar bukti, disimpan per alur di folder unggahan organisasi."""

import shutil
import uuid

from app.services.knowledge import storage


def folder(organization_id: uuid.UUID, flow_id: uuid.UUID) -> str:
    return f"{organization_id}/browser/{flow_id}"


def relative(organization_id: uuid.UUID, flow_id: uuid.UUID, run_id: uuid.UUID, no: int) -> str:
    return f"{folder(organization_id, flow_id)}/{run_id}/{int(no)}.webp"


def save(organization_id, flow_id, run_id, no: int, data: bytes) -> None:
    path = storage.path_of(relative(organization_id, flow_id, run_id, no))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def delete_flow(organization_id: uuid.UUID, flow_id: uuid.UUID) -> None:
    shutil.rmtree(storage.path_of(folder(organization_id, flow_id)), ignore_errors=True)
