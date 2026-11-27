"""/api/v1/admin/pengetahuan."""

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    CurrentMember,
    get_current_member,
    get_db,
    limited,
    require_manager,
)
from app.api.v1.common import ApiResponse, Paging, paging
from app.api.v1.endpoints.admin.pengetahuan import service
from app.api.v1.endpoints.admin.pengetahuan.schema import (
    DocumentDetail,
    DocumentItem,
    DocumentList,
    DocumentMeta,
    SearchHit,
    VersionDetail,
)
from app.core.config import settings
from app.core.exceptions import (
    ForbiddenException,
    UnprocessableEntityException,
    validation_message,
)

router = APIRouter(prefix="/pengetahuan", tags=["Pengetahuan"])


async def _content(file: UploadFile | None, missing: str) -> tuple[str, bytes]:
    if file is None or not file.filename:
        raise UnprocessableEntityException(missing)
    # Dibaca paling banyak satu bita melebihi batas, cukup untuk tahu terlalu besar
    return file.filename, await file.read(settings.MAX_UPLOAD_BYTES + 1)


@router.get("/read", response_model=DocumentList)
async def read_documents(
    search: str = "",
    scope: str = "",
    scope_id: str = "",
    doc_type: str = "",
    status: str = "",
    agent_id: str = "",
    category: str = "",
    page: Paging = Depends(paging(50)),
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> DocumentList:
    total, data, summary = await service.read_documents(
        session,
        member.organization_id,
        search,
        scope,
        scope_id,
        doc_type,
        status,
        agent_id,
        page,
        category,
    )
    return DocumentList(total=total, skip=page.skip, limit=page.limit, data=data, summary=summary)


@router.get(
    "/search",
    response_model=ApiResponse[list[SearchHit]],
    dependencies=[limited("cari", "RATE_SEARCH_PER_MINUTE")],
)
async def search(
    q: str = "",
    agent_id: str = "",
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[SearchHit]]:
    data = await service.search(session, member.organization_id, q, agent_id)
    return ApiResponse(data=data)


@router.post(
    "/create",
    response_model=ApiResponse[DocumentItem],
    status_code=status.HTTP_201_CREATED,
    dependencies=[limited("unggah", "RATE_UPLOAD_PER_MINUTE")],
)
async def create_document(
    file: UploadFile | None = File(default=None),
    title: str = Form(default=""),
    description: str = Form(default=""),
    doc_type: str = Form(default=""),
    scope: str = Form(default=""),
    scope_id: str = Form(default=""),
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DocumentItem]:
    # Penanggung jawab role boleh mengunggah uraian jabatan role itu sendiri (kontrak 16.1)
    if member.access_role not in ("owner", "admin") and not (
        member.access_role == "member"
        and doc_type == "uraian_jabatan"
        and scope == "agent"
        and await service.owns_role(session, member, scope_id)
    ):
        raise ForbiddenException("Hanya pemilik atau admin yang dapat melakukan perubahan ini.")
    file_name, data = await _content(file, "Pilih berkas yang akan diunggah.")
    if scope not in ("organization", "unit", "agent"):
        raise UnprocessableEntityException("Lingkup dokumen tidak valid.")
    try:
        meta = DocumentMeta(
            # Judul bawaan: nama berkas tanpa ekstensi
            title=title.strip() or file_name.rsplit(".", 1)[0][:200],
            description=description,
            doc_type=doc_type or "lainnya",
            scope=scope,
            scope_id=scope_id or None,
        )
    except ValidationError as exc:
        raise UnprocessableEntityException(validation_message(exc.errors())) from exc
    item = await service.create_document(session, member, meta, file_name, data)
    return ApiResponse(statusCode=201, message="Dokumen diterima dan sedang diolah.", data=item)


@router.put("/update/{document_id}", response_model=ApiResponse[DocumentDetail])
async def update_document(
    document_id: str,
    body: DocumentMeta,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DocumentDetail]:
    data = await service.update_document(session, member.organization_id, document_id, body)
    return ApiResponse(message="Dokumen diperbarui.", data=data)


@router.delete("/delete/{document_id}", response_model=ApiResponse[None])
async def delete_document(
    document_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    archived = await service.delete_document(session, member.organization_id, document_id)
    message = (
        "Dokumen dihapus. Isinya tetap bisa dibuka dari rujukan tugas."
        if archived
        else "Dokumen dihapus."
    )
    return ApiResponse(message=message, data=None)


@router.get("/{document_id}", response_model=ApiResponse[DocumentDetail])
async def read_document(
    document_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DocumentDetail]:
    data = await service.read_document(session, member.organization_id, document_id)
    return ApiResponse(data=data)


@router.post(
    "/{document_id}/versions",
    dependencies=[limited("unggah", "RATE_UPLOAD_PER_MINUTE")],
    response_model=ApiResponse[DocumentDetail],
    status_code=status.HTTP_201_CREATED,
)
async def add_version(
    document_id: str,
    file: UploadFile | None = File(default=None),
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DocumentDetail]:
    file_name, data = await _content(file, "Pilih berkas versi baru.")
    detail, number = await service.add_version(session, member, document_id, file_name, data)
    return ApiResponse(
        statusCode=201, message=f"Versi {number} diterima dan sedang diolah.", data=detail
    )


@router.get("/{document_id}/versions/{version_id}", response_model=ApiResponse[VersionDetail])
async def read_version(
    document_id: str,
    version_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[VersionDetail]:
    data = await service.read_version(session, member.organization_id, document_id, version_id)
    return ApiResponse(data=data)


@router.get("/{document_id}/versions/{version_id}/file", response_class=FileResponse)
async def download_version(
    document_id: str,
    version_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> FileResponse:
    path, mime_type, file_name = await service.version_file(
        session, member.organization_id, document_id, version_id
    )
    return FileResponse(
        path,
        media_type=mime_type,
        filename=file_name,
        # Selalu diunduh, tidak pernah ditampilkan atau ditebak jenisnya oleh peramban
        content_disposition_type="attachment",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.put(
    "/{document_id}/versions/{version_id}/activate",
    response_model=ApiResponse[DocumentDetail],
)
async def activate_version(
    document_id: str,
    version_id: str,
    member: CurrentMember = Depends(require_manager),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DocumentDetail]:
    detail, number = await service.activate_version(
        session, member.organization_id, document_id, version_id
    )
    return ApiResponse(message=f"Versi {number} sekarang aktif.", data=detail)
