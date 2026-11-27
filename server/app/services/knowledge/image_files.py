"""Membaca gambar WebP yang tersimpan, utuh atau dipotong (kontrak 16.5 dan 16.6)."""

import asyncio

from app.core.exceptions import NotFoundException, UnprocessableEntityException
from app.services.knowledge import storage
from app.services.knowledge.visual import crop, parse_box


async def read_image(relative: str, box: str) -> bytes:
    """Isi gambar WebP; dipotong bila `box` diisi (y0,x0,y1,x1 dalam 0–1000)."""
    wanted = None
    if box:
        wanted = parse_box(box)
        if wanted is None:
            raise UnprocessableEntityException("Kotak potongan tidak valid.")
    path = storage.path_of(relative)
    if not path.is_file():
        raise NotFoundException("Berkas tidak ditemukan di server.")
    data = await asyncio.to_thread(path.read_bytes)
    return await asyncio.to_thread(crop, data, wanted) if wanted else data
