"""/api/v1/admin/tugas."""

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    CurrentMember,
    get_current_member,
    get_db,
    limited,
    require_access,
)
from app.api.v1.common import ApiResponse, Paging, paging
from app.api.v1.endpoints.admin.pengetahuan.route import image_response
from app.api.v1.endpoints.admin.tugas import attachments, service
from app.api.v1.endpoints.admin.tugas.schema import (
    AttachmentItem,
    TaskCreate,
    TaskDetail,
    TaskItem,
    TaskList,
)
from app.core.config import settings
from app.core.exceptions import UnprocessableEntityException

router = APIRouter(prefix="/tugas", tags=["Tugas"])
require_creator = require_access(
    "owner", "admin", "member", message="Pemantau tidak dapat membuat tugas."
)


@router.post(
    "/lampiran",
    response_model=ApiResponse[AttachmentItem],
    status_code=status.HTTP_201_CREATED,
    dependencies=[limited("lampiran", "RATE_ATTACHMENT_PER_MINUTE")],
)
async def upload_attachment(
    file: UploadFile | None = File(default=None),
    member: CurrentMember = Depends(
        require_access(
            "owner", "admin", "member", message="Pemantau tidak dapat mengunggah lampiran."
        )
    ),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[AttachmentItem]:
    if file is None or not file.filename:
        raise UnprocessableEntityException("Pilih berkas lampiran.")
    data = await file.read(settings.MAX_IMAGE_BYTES + 1)
    item = await attachments.upload(session, member, file.filename, data)
    return ApiResponse(statusCode=201, message="Lampiran diterima.", data=item)


@router.get("/lampiran/{attachment_id}/pages/{page_no}", response_class=Response)
async def attachment_page(
    attachment_id: str,
    page_no: int,
    box: str = "",
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Gambar satu halaman lampiran, atau potongannya (kontrak 16.6)."""
    data = await attachments.page_image(
        session, member.organization_id, attachment_id, page_no, box
    )
    return image_response(data)


@router.get("/read", response_model=TaskList)
async def read_tasks(
    search: str = "",
    status: str = "",
    agent_id: str = "",
    page: Paging = Depends(paging(50)),
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> TaskList:
    total, data, summary = await service.read_tasks(
        session, member.organization_id, search, status, agent_id, page
    )
    return TaskList(total=total, skip=page.skip, limit=page.limit, data=data, summary=summary)


@router.post(
    "/create",
    response_model=ApiResponse[TaskItem],
    status_code=status.HTTP_201_CREATED,
    dependencies=[limited("tugas", "RATE_TASK_PER_MINUTE")],
)
async def create_task(
    body: TaskCreate,
    member: CurrentMember = Depends(require_creator),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskItem]:
    data = await service.create_task(session, member, body)
    return ApiResponse(statusCode=201, message="Tugas dibuat dan masuk antrean.", data=data)


@router.post("/{task_id}/cancel", response_model=ApiResponse[TaskItem])
async def cancel_task(
    task_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskItem]:
    data = await service.cancel_task(session, member, task_id)
    return ApiResponse(message="Tugas dihentikan.", data=data)


@router.get("/{task_id}", response_model=ApiResponse[TaskDetail])
async def read_task(
    task_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskDetail]:
    return ApiResponse(data=await service.read_task(session, member, task_id))
