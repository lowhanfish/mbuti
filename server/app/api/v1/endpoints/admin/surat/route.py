"""/api/v1/admin/tugas/{id}/berkas dan /api/v1/admin/pengaturan/persuratan (kontrak 18)."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    CurrentMember,
    get_current_member,
    get_db,
    limited,
    require_access,
    require_manager,
)
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.pengetahuan.route import image_response
from app.api.v1.endpoints.admin.surat import documents, settings
from app.api.v1.endpoints.admin.surat.schema import (
    CheckedRequest,
    CorrectionRequest,
    LetterSettings,
    RegisterRequest,
    ResultDocumentItem,
    SheetResultItem,
)
from app.core.exceptions import UnprocessableEntityException
from app.services.letters.sample import MAX_SAMPLE_BYTES

documents_router = APIRouter(prefix="/tugas/{task_id}/berkas", tags=["Berkas hasil"])
settings_router = APIRouter(prefix="/pengaturan/persuratan", tags=["Persuratan"])
require_corrector = require_access(
    "owner", "admin", "member", message="Pemantau tidak dapat memperbaiki format."
)
PRIVATE = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-cache"}


@documents_router.get("", response_model=ApiResponse[list[ResultDocumentItem | SheetResultItem]])
async def read_documents(
    task_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[ResultDocumentItem | SheetResultItem]]:
    return ApiResponse(data=await documents.read_documents(session, member, task_id))


@documents_router.post(
    "/{result_id}/koreksi",
    response_model=ApiResponse[ResultDocumentItem],
    dependencies=[limited("surat", "RATE_LETTER_CORRECTION_PER_MINUTE")],
)
async def correct(
    task_id: str,
    result_id: str,
    body: CorrectionRequest,
    member: CurrentMember = Depends(require_corrector),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ResultDocumentItem]:
    data = await documents.correct(session, member, task_id, result_id, body.text)
    return ApiResponse(message="Format diperbaiki.", data=data)


@documents_router.post("/{result_id}/nomor", response_model=ApiResponse[ResultDocumentItem])
async def give_number(
    task_id: str,
    result_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ResultDocumentItem]:
    data = await documents.give_number(session, member, task_id, result_id)
    return ApiResponse(message="Nomor surat diberikan.", data=data)


@documents_router.get("/{result_id}/halaman/{page_no}", response_class=Response)
async def page(
    task_id: str,
    result_id: str,
    page_no: int,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> Response:
    return image_response(await documents.page_image(session, member, task_id, result_id, page_no))


@documents_router.get("/{result_id}/unduh/{kind}", response_class=Response)
async def download(
    task_id: str,
    result_id: str,
    kind: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> Response:
    data, media, name = await documents.download(session, member, task_id, result_id, kind)
    disposition = f"attachment; filename*=UTF-8''{quote(name)}"
    return Response(data, media_type=media, headers={**PRIVATE, "Content-Disposition": disposition})


@settings_router.get("", response_model=ApiResponse[LetterSettings])
async def read_settings(
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[LetterSettings]:
    return ApiResponse(data=await settings.read_settings(session, member))


@settings_router.put("/format/{format_id}", response_model=ApiResponse[None])
async def check_format(
    format_id: str,
    body: CheckedRequest,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await settings.check_format(session, member, format_id, body.checked)
    return ApiResponse(message="Format diperbarui.", data=None)


@settings_router.delete("/format/{format_id}", response_model=ApiResponse[None])
async def delete_format(
    format_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await settings.delete_format(session, member, format_id)
    return ApiResponse(message="Catatan format dihapus.", data=None)


@settings_router.delete(
    "/format/{format_id}/koreksi/{correction_id}", response_model=ApiResponse[None]
)
async def delete_correction(
    format_id: str,
    correction_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await settings.delete_correction(session, member, format_id, correction_id)
    return ApiResponse(message="Koreksi dihapus.", data=None)


async def _content(file: UploadFile | None, missing: str, limit: int) -> tuple[str, bytes]:
    if file is None or not file.filename:
        raise UnprocessableEntityException(missing)
    # Dibaca paling banyak satu bita melebihi batas, cukup untuk tahu terlalu besar
    return file.filename, await file.read(limit + 1)


@settings_router.post("/kop", response_model=ApiResponse[None], status_code=status.HTTP_201_CREATED)
async def save_letterhead(
    file: UploadFile | None = File(default=None),
    unit_id: str = Form(default=""),
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    _, data = await _content(file, settings.NOT_IMAGE, settings.MAX_LETTERHEAD_BYTES)
    await settings.save_letterhead(session, member, data, unit_id)
    return ApiResponse(statusCode=201, message="Kop tersimpan.", data=None)


@settings_router.get("/kop/{letterhead_id}/gambar", response_class=Response)
async def letterhead_image(
    letterhead_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> Response:
    data, media = await settings.letterhead_image(session, member, letterhead_id)
    return Response(data, media_type=media, headers=PRIVATE)


@settings_router.delete("/kop/{letterhead_id}", response_model=ApiResponse[None])
async def delete_letterhead(
    letterhead_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await settings.delete_letterhead(session, member, letterhead_id)
    return ApiResponse(message="Kop dihapus.", data=None)


@settings_router.put("/register/{register_id}", response_model=ApiResponse[None])
async def save_register(
    register_id: str,
    body: RegisterRequest,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await settings.save_register(session, member, register_id, body)
    return ApiResponse(message="Register tersimpan.", data=None)


@settings_router.post(
    "/contoh", response_model=ApiResponse[None], status_code=status.HTTP_201_CREATED
)
async def save_sample(
    file: UploadFile | None = File(default=None),
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    name, data = await _content(file, "Pilih berkas Word (.docx).", MAX_SAMPLE_BYTES)
    await settings.save_sample(session, member, name, data)
    return ApiResponse(statusCode=201, message="Contoh tersimpan.", data=None)


@settings_router.delete("/contoh/{sample_id}", response_model=ApiResponse[None])
async def delete_sample(
    sample_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await settings.delete_sample(session, member, sample_id)
    return ApiResponse(message="Contoh dihapus.", data=None)
