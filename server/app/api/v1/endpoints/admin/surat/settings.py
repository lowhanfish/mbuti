"""Pengaturan persuratan: catatan format, kop, register, dan contoh Word (kontrak 18.4)."""

import asyncio
import io
import uuid
from zoneinfo import ZoneInfo

from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import MANAGERS, CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.surat.schema import (
    FormatItem,
    IssuedNumber,
    LetterheadItem,
    LetterSettings,
    RegisterItem,
    RegisterRequest,
    SampleItem,
)
from app.core.exceptions import (
    ConflictException,
    NotFoundException,
    UnprocessableEntityException,
)
from app.models import (
    LetterFormat,
    Letterhead,
    LetterNumber,
    LetterRegister,
    LetterSample,
    Organization,
    Unit,
    User,
)
from app.models.base import utcnow
from app.services.knowledge import storage
from app.services.letters import sample as samples
from app.services.letters import spec as letter_spec
from app.services.letters.numbering import format_number
from app.services.organisation import lock_organization, require_unit

BASE = "/api/v1/admin/pengaturan/persuratan"
FORMAT_NOT_FOUND = "Catatan format tidak ditemukan."
MAX_LETTERHEAD_BYTES = 2_000_000
MAX_LETTERHEAD_PIXELS = 2480
MAX_ISSUED = 50
NOT_IMAGE = "Pilih gambar PNG atau JPG."


async def _today(session: AsyncSession, organization_id: uuid.UUID):
    organization = await session.get(Organization, organization_id)
    return utcnow().astimezone(ZoneInfo(organization.timezone)).date()


def _format_item(note: LetterFormat) -> FormatItem:
    spec = note.spec
    return FormatItem(
        id=str(note.id),
        name=note.name,
        paper=letter_spec.paper_label(spec["paper"]),
        margins=spec["margins"],
        font=f"{spec['font_name']} {spec['font_size']:g} pt",
        sections=[letter_spec.SECTION_LABEL[s] for s in spec["sections"]],
        sources=note.sources,
        checked=note.checked,
        corrections=note.corrections,
        updated_at=note.updated_at,
    )


async def read_settings(session: AsyncSession, actor: CurrentMember) -> LetterSettings:
    organization_id = actor.organization_id
    today = await _today(session, organization_id)
    notes = await session.scalars(
        select(LetterFormat)
        .where(LetterFormat.organization_id == organization_id)
        .order_by(LetterFormat.name)
    )
    formats = [_format_item(n) for n in notes]
    heads = await session.execute(
        select(Letterhead, Unit.name)
        .outerjoin(Unit, Unit.id == Letterhead.unit_id)
        .where(Letterhead.organization_id == organization_id)
        .order_by(Letterhead.created_at)
    )
    letterheads = [
        LetterheadItem(
            id=str(h.id),
            unit_id=str(h.unit_id) if h.unit_id else None,
            unit_name=unit_name,
            image_url=f"{BASE}/kop/{h.id}/gambar",
            created_at=h.created_at,
        )
        for h, unit_name in heads
    ]
    registers = []
    for register in (
        await session.scalars(
            select(LetterRegister)
            .where(LetterRegister.organization_id == organization_id)
            .order_by(LetterRegister.name)
        )
    ).all():
        issued = await session.scalars(
            select(LetterNumber)
            .where(LetterNumber.register_id == register.id)
            .order_by(LetterNumber.issued_at.desc())
            .limit(MAX_ISSUED)
        )
        sequence = register.next_number if register.year == today.year else 1
        registers.append(
            RegisterItem(
                id=str(register.id),
                name=register.name,
                pattern=register.pattern,
                next_number=sequence,
                preview=format_number(register.pattern, sequence, today),
                issued=[
                    IssuedNumber(
                        number=n.number,
                        title=n.title,
                        task_id=str(n.task_id) if n.task_id else None,
                        issued_at=n.issued_at,
                    )
                    for n in issued
                ],
            )
        )
    rows = await session.execute(
        select(LetterSample, User.full_name)
        .outerjoin(User, User.id == LetterSample.created_by)
        .where(LetterSample.organization_id == organization_id)
        .order_by(LetterSample.created_at.desc())
    )
    return LetterSettings(
        formats=formats,
        letterheads=letterheads,
        registers=registers,
        samples=[
            SampleItem(
                id=str(s.id),
                file_name=s.file_name,
                size_bytes=s.size_bytes,
                uploaded_by_name=name,
                created_at=s.created_at,
            )
            for s, name in rows
        ],
        can_edit=actor.access_role in MANAGERS,
    )


async def _owned(session: AsyncSession, model, actor: CurrentMember, value: str, missing: str):
    found = await session.scalar(
        select(model).where(
            model.id == parse_id(value, missing),
            model.organization_id == actor.organization_id,
        )
    )
    if found is None:
        raise NotFoundException(missing)
    return found


async def check_format(
    session: AsyncSession, actor: CurrentMember, format_id: str, checked: bool
) -> None:
    note = await _owned(session, LetterFormat, actor, format_id, FORMAT_NOT_FOUND)
    note.checked = checked
    await session.commit()


async def delete_format(session: AsyncSession, actor: CurrentMember, format_id: str) -> None:
    note = await _owned(session, LetterFormat, actor, format_id, FORMAT_NOT_FOUND)
    await session.delete(note)
    await session.commit()


async def delete_correction(
    session: AsyncSession, actor: CurrentMember, format_id: str, correction_id: str
) -> None:
    await lock_organization(session, actor.organization_id)
    note = await _owned(session, LetterFormat, actor, format_id, FORMAT_NOT_FOUND)
    remaining = [c for c in note.corrections if c["id"] != correction_id]
    if len(remaining) == len(note.corrections):
        raise NotFoundException("Koreksi tidak ditemukan.")
    note.corrections = remaining
    await session.commit()


def _clean_image(data: bytes) -> tuple[str, bytes]:
    """Gambar ditulis ulang agar metadata dan isi tambahan tidak ikut tersimpan."""
    if len(data) > MAX_LETTERHEAD_BYTES:
        raise UnprocessableEntityException("Gambar kop paling besar 2 MB.")
    try:
        image = Image.open(io.BytesIO(data))
        kind = image.format
        if kind not in ("PNG", "JPEG"):
            raise UnprocessableEntityException(NOT_IMAGE)
        image.load()
        image = image.convert("RGBA" if kind == "PNG" else "RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise UnprocessableEntityException(NOT_IMAGE) from None
    image.thumbnail((MAX_LETTERHEAD_PIXELS, MAX_LETTERHEAD_PIXELS))
    buffer = io.BytesIO()
    image.save(buffer, kind)
    return ("png" if kind == "PNG" else "jpg"), buffer.getvalue()


async def save_letterhead(
    session: AsyncSession, actor: CurrentMember, data: bytes, unit_value: str
) -> None:
    extension, cleaned = await asyncio.to_thread(_clean_image, data)
    await lock_organization(session, actor.organization_id)
    unit_id = await require_unit(
        session, actor.organization_id, unit_value or None, "Unit tidak ditemukan."
    )
    old = (
        await session.scalars(
            select(Letterhead).where(
                Letterhead.organization_id == actor.organization_id,
                Letterhead.unit_id == unit_id,
            )
        )
    ).all()
    path = await asyncio.to_thread(storage.save, actor.organization_id, extension, cleaned)
    session.add(
        Letterhead(
            organization_id=actor.organization_id,
            unit_id=unit_id,
            path=path,
            created_by=actor.user.id,
        )
    )
    old_paths = [h.path for h in old]
    for head in old:
        await session.delete(head)
    await session.commit()
    for stale in old_paths:
        storage.delete(stale)


async def letterhead_image(
    session: AsyncSession, actor: CurrentMember, letterhead_id: str
) -> tuple[bytes, str]:
    missing = "Kop tidak ditemukan."
    head = await _owned(session, Letterhead, actor, letterhead_id, missing)
    try:
        data = await asyncio.to_thread(storage.path_of(head.path).read_bytes)
    except FileNotFoundError:
        raise NotFoundException(missing) from None
    return data, "image/png" if head.path.endswith("png") else "image/jpeg"


async def delete_letterhead(session: AsyncSession, actor: CurrentMember, value: str) -> None:
    head = await _owned(session, Letterhead, actor, value, "Kop tidak ditemukan.")
    path = head.path
    await session.delete(head)
    await session.commit()
    storage.delete(path)


async def save_register(
    session: AsyncSession, actor: CurrentMember, register_id: str, body: RegisterRequest
) -> None:
    pattern = letter_spec.valid_pattern(body.pattern)
    if pattern is None:
        raise UnprocessableEntityException("Pola nomor harus memuat [urut], maksimal 80 karakter.")
    if not 1 <= body.next_number <= 999_999:
        raise UnprocessableEntityException("Urut berikutnya 1 sampai 999999.")
    await lock_organization(session, actor.organization_id)
    register = await _owned(
        session, LetterRegister, actor, register_id, "Register tidak ditemukan."
    )
    today = await _today(session, actor.organization_id)
    number = format_number(pattern, body.next_number, today)
    if await session.scalar(
        select(LetterNumber.id).where(
            LetterNumber.register_id == register.id, LetterNumber.number == number
        )
    ):
        raise ConflictException("Nomor itu sudah pernah dipakai.")
    register.pattern, register.next_number, register.year = pattern, body.next_number, today.year
    await session.commit()


async def save_sample(
    session: AsyncSession, actor: CurrentMember, file_name: str, data: bytes
) -> None:
    if not file_name.lower().endswith(".docx"):
        raise UnprocessableEntityException("Pilih berkas Word (.docx).")
    await asyncio.to_thread(samples.check_docx, data)
    path = await asyncio.to_thread(storage.save, actor.organization_id, "docx", data)
    session.add(
        LetterSample(
            organization_id=actor.organization_id,
            file_name=file_name.replace("\x00", "")[-200:],
            path=path,
            size_bytes=len(data),
            created_by=actor.user.id,
        )
    )
    await session.commit()


async def delete_sample(session: AsyncSession, actor: CurrentMember, sample_id: str) -> None:
    found = await _owned(session, LetterSample, actor, sample_id, "Contoh tidak ditemukan.")
    path = found.path
    await session.delete(found)
    await session.commit()
    storage.delete(path)
