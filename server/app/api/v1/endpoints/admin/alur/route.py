"""/api/v1/admin/role/{role_id}/alur, /alur, dan /alur-jalan."""

import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db, limited
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.admin.alur import schema, service
from app.workers.browser import execute_browser_run

logger = logging.getLogger("mbuti.alur")

router = APIRouter(tags=["Alur aplikasi"])
# Belajar dan menjalankan membuka peramban dan bisa memanggil model
start_limit = [limited("alur", "RATE_BROWSER_PER_MINUTE")]


def enqueue(run_id: str | None) -> None:
    """Antrean yang mati tidak menggagalkan permintaan: penjadwal mengirim ulang."""
    if run_id is None:
        return
    try:
        execute_browser_run.apply_async(args=[run_id])
    except Exception:
        logger.exception("Putaran %s gagal dimasukkan ke antrean", run_id)


@router.get("/role/{role_id}/alur", response_model=ApiResponse[schema.FlowList])
async def read_flows(
    role_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.FlowList]:
    return ApiResponse(data=await service.read_flows(session, member, role_id))


# Hak akses diperiksa service: penanggung jawab role, pemilik, atau admin
@router.post(
    "/role/{role_id}/alur",
    response_model=ApiResponse[schema.FlowDetail],
    status_code=status.HTTP_201_CREATED,
    dependencies=start_limit,
)
async def create_flow(
    role_id: str,
    body: schema.LearnRequest,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.FlowDetail]:
    data, run_id = await service.create_flow(session, member, role_id, body)
    enqueue(run_id)
    return ApiResponse(statusCode=201, message="Role mulai belajar.", data=data)


@router.get("/alur/{flow_id}", response_model=ApiResponse[schema.FlowDetail])
async def read_flow(
    flow_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.FlowDetail]:
    return ApiResponse(data=await service.read_flow(session, member, flow_id))


@router.post(
    "/alur/{flow_id}/pelajari",
    response_model=ApiResponse[schema.FlowDetail],
    dependencies=start_limit,
)
async def relearn(
    flow_id: str,
    body: schema.FlowBody,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.FlowDetail]:
    data, run_id = await service.relearn(session, member, flow_id, body)
    enqueue(run_id)
    return ApiResponse(message="Role mulai belajar.", data=data)


@router.post("/alur/{flow_id}/setujui", response_model=ApiResponse[schema.FlowDetail])
async def approve(
    flow_id: str,
    body: schema.ApproveRequest,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.FlowDetail]:
    data = await service.approve(session, member, flow_id, body.version)
    return ApiResponse(message="Alur disetujui.", data=data)


@router.post(
    "/alur/{flow_id}/jalankan",
    response_model=ApiResponse[schema.RunDetail],
    status_code=status.HTTP_201_CREATED,
    dependencies=start_limit,
)
async def start_run(
    flow_id: str,
    body: schema.RunRequest,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.RunDetail]:
    data, run_id = await service.start_run(session, member, flow_id, body.inputs)
    enqueue(run_id)
    return ApiResponse(statusCode=201, message="Putaran dimulai.", data=data)


@router.post("/alur/{flow_id}/tanpa-persetujuan", response_model=ApiResponse[schema.FlowDetail])
async def set_trust(
    flow_id: str,
    body: schema.TrustRequest,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.FlowDetail]:
    data = await service.set_trust(session, member, flow_id, body)
    return ApiResponse(message="Pengaturan persetujuan tersimpan.", data=data)


@router.post("/alur/{flow_id}/hapus", response_model=ApiResponse[None])
async def delete_flow(
    flow_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await service.delete_flow(session, member, flow_id)
    return ApiResponse(message="Alur dihapus.", data=None)


@router.get("/alur-jalan/{browser_run_id}", response_model=ApiResponse[schema.RunDetail])
async def read_run(
    browser_run_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.RunDetail]:
    return ApiResponse(data=await service.read_run(session, member, browser_run_id))


@router.post("/alur-jalan/{browser_run_id}/putuskan", response_model=ApiResponse[schema.RunDetail])
async def decide(
    browser_run_id: str,
    body: schema.DecisionRequest,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.RunDetail]:
    data, run_id = await service.decide(session, member, browser_run_id, body.decision)
    enqueue(run_id)
    message = "Disetujui." if body.decision == "approved" else "Ditolak."
    return ApiResponse(message=message, data=data)


@router.post("/alur-jalan/{browser_run_id}/otp", response_model=ApiResponse[schema.RunDetail])
async def send_otp(
    browser_run_id: str,
    body: schema.OtpRequest,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.RunDetail]:
    data = await service.send_otp(session, member, browser_run_id, body.code.get_secret_value())
    return ApiResponse(message="Kode dikirim.", data=data)


@router.post("/alur-jalan/{browser_run_id}/hentikan", response_model=ApiResponse[schema.RunDetail])
async def stop(
    browser_run_id: str,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[schema.RunDetail]:
    data = await service.stop(session, member, browser_run_id)
    return ApiResponse(message="Putaran dihentikan.", data=data)


@router.get("/alur-jalan/{browser_run_id}/bukti/{number}", response_class=FileResponse)
async def evidence(
    browser_run_id: str,
    number: int,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> FileResponse:
    path = await service.evidence_file(session, member, browser_run_id, number)
    return FileResponse(
        path,
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )
