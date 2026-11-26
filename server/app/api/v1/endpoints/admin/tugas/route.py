"""/api/v1/admin/tugas."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    CurrentMember,
    get_current_member,
    get_db,
    require_access,
)
from app.api.v1.common import ApiResponse, Paging, paging
from app.api.v1.endpoints.admin.tugas import service
from app.api.v1.endpoints.admin.tugas.schema import TaskCreate, TaskDetail, TaskItem, TaskList

router = APIRouter(prefix="/tugas", tags=["Tugas"])
require_creator = require_access(
    "owner", "admin", "member", message="Pemantau tidak dapat membuat tugas."
)


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


@router.post("/create", response_model=ApiResponse[TaskItem], status_code=status.HTTP_201_CREATED)
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
    return ApiResponse(data=await service.read_task(session, member.organization_id, task_id))
