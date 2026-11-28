"""
Jejak audit: tindakan yang mengubah data, beserta masuk dan keluar.

Setiap rute yang mengubah data harus terdaftar di `ACTIONS` (diperiksa oleh tes), sehingga
rute baru tidak bisa terlewat tanpa disadari. Isi dokumen, arahan tugas, dan kata sandi
tidak pernah dicatat; hanya nama benda yang dikenai.
"""

import logging
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember, get_current_member, get_db
from app.core.request_context import current_request_id
from app.models import (
    Agent,
    AgentRelation,
    Approval,
    AuditLog,
    CalendarDay,
    Document,
    LetterFormat,
    LetterRegister,
    LetterSample,
    Membership,
    Schedule,
    Task,
    Unit,
    User,
    WorkShift,
)

logger = logging.getLogger("mbuti.audit")

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
# Kolom kiriman yang boleh dipakai sebagai nama sasaran
NAME_FIELDS = ("name", "title", "full_name")
DECISIONS = {"approved": "disetujui", "rejected": "ditolak", "revise": "minta revisi"}


@dataclass(frozen=True)
class Action:
    code: str
    label: str


CALENDAR_CHANGE = Action("kalender.ubah", "Mengubah kalender kerja")
LEAVE_CHANGE = Action("cuti.ubah", "Mengubah cuti anggota")
SCHEDULE_CHANGE = Action("rutin.ubah", "Mengubah tugas rutin")
SCHEDULE_RUN = Action("rutin.jalankan", "Menjalankan tugas rutin")
LETTER_CORRECTION = Action("surat.koreksi", "Mengoreksi format surat")
LETTER_NUMBER = Action("surat.nomor", "Mengatur nomor surat")
LETTER_SETTINGS = Action("surat.pengaturan", "Mengubah pengaturan persuratan")

# Kunci: (metode, alamat rute). None berarti sengaja tidak dicatat (tata letak peta, atau
# permintaan yang tidak menyimpan apa pun).
ACTIONS: dict[tuple[str, str], Action | None] = {
    ("PUT", "/organisasi/profil/update"): Action("organisasi.ubah", "Mengubah profil organisasi"),
    ("POST", "/unit/create"): Action("unit.buat", "Membuat unit"),
    ("PUT", "/unit/update/{unit_id}"): Action("unit.ubah", "Mengubah unit"),
    ("DELETE", "/unit/delete/{unit_id}"): Action("unit.hapus", "Menghapus unit"),
    ("POST", "/pengguna/invite"): Action("anggota.undang", "Mengundang anggota"),
    ("POST", "/pengguna/resend-invite/{member_id}"): Action(
        "anggota.kirim_ulang", "Mengirim ulang undangan"
    ),
    ("PUT", "/pengguna/update/{member_id}"): Action("anggota.ubah", "Mengubah anggota"),
    ("DELETE", "/pengguna/delete/{member_id}"): Action("anggota.keluarkan", "Mengeluarkan anggota"),
    ("POST", "/role/create"): Action("role.buat", "Membuat role"),
    ("PUT", "/role/update/{role_id}"): Action("role.ubah", "Mengubah role"),
    ("DELETE", "/role/delete/{role_id}"): Action("role.hapus", "Menghapus role"),
    ("POST", "/role/{role_id}/trial"): Action("role.ujicoba", "Menguji coba role"),
    ("POST", "/role/{role_id}/pembentukan/mulai"): Action("role.bentuk", "Memulai revisi role"),
    ("PUT", "/role/{role_id}/pembentukan/bahan"): Action(
        "role.bentuk", "Menyimpan bahan pembentukan"
    ),
    ("POST", "/role/{role_id}/pembentukan/analisis"): Action(
        "role.bentuk", "Menjalankan analisis role"
    ),
    ("PUT", "/role/{role_id}/pembentukan/kartu"): Action(
        "role.bentuk", "Mengubah kartu keterampilan"
    ),
    ("POST", "/role/{role_id}/pembentukan/jawab"): Action(
        "role.bentuk", "Menjawab tanya jawab role"
    ),
    ("POST", "/role/{role_id}/pembentukan/batal"): Action("role.bentuk", "Membuang revisi role"),
    ("POST", "/role/{role_id}/pembentukan/final"): Action("role.final", "Mem-Final versi role"),
    ("POST", "/role/{role_id}/versi/{version_id}/pulihkan"): Action(
        "role.pulihkan", "Memulihkan versi role"
    ),
    ("POST", "/relasi/create"): Action("relasi.buat", "Membuat relasi"),
    ("PUT", "/relasi/update/{relation_id}"): Action("relasi.ubah", "Mengubah relasi"),
    ("DELETE", "/relasi/delete/{relation_id}"): Action("relasi.hapus", "Menghapus relasi"),
    ("POST", "/relasi/humans"): Action("relasi.manusia", "Menaruh manusia di peta"),
    ("DELETE", "/relasi/humans/{member_id}"): Action(
        "relasi.manusia", "Mengeluarkan manusia dari peta"
    ),
    ("PUT", "/relasi/positions"): None,
    ("DELETE", "/relasi/positions"): None,
    ("POST", "/pengetahuan/create"): Action("dokumen.unggah", "Mengunggah dokumen"),
    ("PUT", "/pengetahuan/update/{document_id}"): Action("dokumen.ubah", "Mengubah dokumen"),
    ("DELETE", "/pengetahuan/delete/{document_id}"): Action("dokumen.hapus", "Menghapus dokumen"),
    ("POST", "/pengetahuan/{document_id}/versions"): Action(
        "dokumen.versi", "Mengunggah versi dokumen"
    ),
    ("PUT", "/pengetahuan/{document_id}/versions/{version_id}/activate"): Action(
        "dokumen.versi", "Mengganti versi aktif dokumen"
    ),
    ("PUT", "/pengaturan/model-ai/update"): Action("pengaturan.model", "Mengubah model AI"),
    ("PUT", "/pengaturan/batas-biaya/update"): Action("pengaturan.biaya", "Mengubah batas biaya"),
    # Satu kode satu label: halaman Jejak Audit membaca label dari kodenya
    ("PUT", "/pengaturan/kalender"): CALENDAR_CHANGE,
    ("POST", "/pengaturan/kalender/shift"): CALENDAR_CHANGE,
    ("PUT", "/pengaturan/kalender/shift/{shift_id}"): CALENDAR_CHANGE,
    ("DELETE", "/pengaturan/kalender/shift/{shift_id}"): CALENDAR_CHANGE,
    ("POST", "/pengaturan/kalender/hari"): CALENDAR_CHANGE,
    ("POST", "/pengaturan/kalender/hari/impor"): CALENDAR_CHANGE,
    ("DELETE", "/pengaturan/kalender/hari/{day_id}"): CALENDAR_CHANGE,
    ("POST", "/organisasi/pengguna/{member_id}/cuti"): LEAVE_CHANGE,
    ("DELETE", "/organisasi/pengguna/{member_id}/cuti/{leave_id}"): LEAVE_CHANGE,
    ("POST", "/tugas-rutin"): SCHEDULE_CHANGE,
    ("PUT", "/tugas-rutin/{schedule_id}"): SCHEDULE_CHANGE,
    ("DELETE", "/tugas-rutin/{schedule_id}"): SCHEDULE_CHANGE,
    ("POST", "/tugas-rutin/{schedule_id}/jeda"): SCHEDULE_CHANGE,
    ("POST", "/tugas-rutin/{schedule_id}/lanjutkan"): SCHEDULE_CHANGE,
    ("POST", "/tugas-rutin/{schedule_id}/jalankan"): SCHEDULE_RUN,
    ("POST", "/tugas-rutin/{schedule_id}/susulan/{run_id}"): SCHEDULE_RUN,
    ("POST", "/tugas-rutin/pahami"): None,
    ("POST", "/tugas/{task_id}/berkas/{result_id}/koreksi"): LETTER_CORRECTION,
    ("POST", "/tugas/{task_id}/berkas/{result_id}/nomor"): LETTER_NUMBER,
    ("PUT", "/pengaturan/persuratan/register/{register_id}"): LETTER_NUMBER,
    ("PUT", "/pengaturan/persuratan/format/{format_id}"): LETTER_SETTINGS,
    ("DELETE", "/pengaturan/persuratan/format/{format_id}"): LETTER_SETTINGS,
    ("DELETE", "/pengaturan/persuratan/format/{format_id}/koreksi/{correction_id}"): (
        LETTER_SETTINGS
    ),
    ("POST", "/pengaturan/persuratan/kop"): LETTER_SETTINGS,
    ("DELETE", "/pengaturan/persuratan/kop/{letterhead_id}"): LETTER_SETTINGS,
    ("POST", "/pengaturan/persuratan/contoh"): LETTER_SETTINGS,
    ("DELETE", "/pengaturan/persuratan/contoh/{sample_id}"): LETTER_SETTINGS,
    ("POST", "/tugas-rutin/pratinjau"): None,
    ("POST", "/pengetahuan/usulan"): Action("dokumen.usulan", "Mengusulkan temuan internet"),
    ("POST", "/pengetahuan/usulan/{proposal_id}/setujui"): Action(
        "dokumen.usulan", "Menyetujui usulan pengetahuan"
    ),
    ("POST", "/pengetahuan/usulan/{proposal_id}/tolak"): Action(
        "dokumen.usulan", "Menolak usulan pengetahuan"
    ),
    ("POST", "/tugas/lampiran"): Action("tugas.lampiran", "Mengunggah lampiran tugas"),
    ("POST", "/tugas/create"): Action("tugas.buat", "Membuat tugas"),
    ("POST", "/tugas/{task_id}/cancel"): Action("tugas.hentikan", "Menghentikan tugas"),
    ("POST", "/persetujuan/{approval_id}/decide"): Action(
        "persetujuan.putuskan", "Memutuskan persetujuan"
    ),
}
AUTH_ACTIONS = {
    "auth.masuk": "Masuk",
    "auth.gagal": "Gagal masuk",
    "auth.keluar": "Keluar",
    "auth.daftar": "Mendaftarkan organisasi",
    "auth.verifikasi": "Memverifikasi email",
    "auth.sandi": "Mengatur ulang kata sandi",
    "anggota.terima": "Menerima undangan",
}
LABELS = {a.code: a.label for a in ACTIONS.values() if a} | AUTH_ACTIONS
PREFIX = "/api/v1/admin"


def label_for(code: str, method_label: str = "") -> str:
    return method_label or LABELS.get(code, code)


def add_entry(
    session: AsyncSession,
    *,
    action: str,
    organization_id: uuid.UUID | None,
    user: User | None,
    email: str = "",
    target: str = "",
    ip: str = "",
) -> None:
    session.add(
        AuditLog(
            organization_id=organization_id,
            user_id=user.id if user else None,
            actor_name=user.full_name if user else "",
            actor_email=(user.email if user else email)[:255],
            action=action,
            target=target[:200],
            ip=ip[:45],
            request_id=current_request_id.get()[:36],
        )
    )


def _uuid(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


async def _name_of(
    session: AsyncSession, organization_id: uuid.UUID, key: str, value: object
) -> str:
    """Nama benda di organisasi ini; kosong bila tidak dikenal."""
    wanted = _uuid(value)
    if wanted is None:
        return ""
    if key == "member_id":
        query = (
            select(User.full_name)
            .join(Membership, Membership.user_id == User.id)
            .where(Membership.id == wanted, Membership.organization_id == organization_id)
        )
    elif key == "approval_id":
        query = (
            select(Task.title)
            .join(Approval, Approval.task_id == Task.id)
            .where(Approval.id == wanted, Task.organization_id == organization_id)
        )
    elif key == "relation_id":
        relation = await session.scalar(
            select(AgentRelation).where(
                AgentRelation.id == wanted, AgentRelation.organization_id == organization_id
            )
        )
        if relation is None:
            return ""
        source = await _name_of(session, organization_id, "role_id", relation.source_agent_id)
        other = "member_id" if relation.target_member_id else "role_id"
        target = await _name_of(
            session, organization_id, other, relation.target_member_id or relation.target_agent_id
        )
        return f"{source} → {target}"
    else:
        model, column = {
            "unit_id": (Unit, Unit.name),
            "role_id": (Agent, Agent.name),
            "document_id": (Document, Document.title),
            "shift_id": (WorkShift, WorkShift.name),
            "day_id": (CalendarDay, CalendarDay.name),
            "schedule_id": (Schedule, Schedule.title),
            "format_id": (LetterFormat, LetterFormat.name),
            "register_id": (LetterRegister, LetterRegister.name),
            "sample_id": (LetterSample, LetterSample.file_name),
            "task_id": (Task, Task.title),
        }[key]
        query = select(column).where(model.id == wanted, model.organization_id == organization_id)
    return await session.scalar(query) or ""


async def _payload(request: Request) -> dict:
    """Isi kiriman yang sudah dibaca FastAPI."""
    kind = request.headers.get("content-type", "")
    try:
        if kind.startswith("application/json"):
            body = await request.json()
            return body if isinstance(body, dict) else {}
        if kind.startswith("multipart/form-data"):
            form = await request.form()
            data = {k: v for k, v in form.items() if isinstance(v, str)}
            upload = form.get("file")
            if not data.get("title") and hasattr(upload, "filename"):
                data["title"] = upload.filename or ""
            return data
    except ValueError:
        return {}
    return {}


async def _describe(session: AsyncSession, member: CurrentMember, request: Request) -> str:
    """Nama sasaran, dibaca sebelum tindakan agar yang dihapus tetap punya nama."""
    organization_id = member.organization_id
    params = request.path_params
    # Parameter pertama menyebut benda utamanya, mis. dokumen sebelum versinya
    for key in (
        "approval_id",
        "task_id",
        "document_id",
        "relation_id",
        "role_id",
        "unit_id",
        "member_id",
        "shift_id",
        "day_id",
        "schedule_id",
        "format_id",
        "register_id",
        "sample_id",
    ):
        if key in params:
            name = await _name_of(session, organization_id, key, params[key])
            if key == "approval_id":
                decision = DECISIONS.get((await _payload(request)).get("decision", ""), "")
                return f"{name} ({decision})" if decision else name
            return name
    body = await _payload(request)
    if "source_id" in body:
        source = await _name_of(session, organization_id, "role_id", body.get("source_id"))
        target = body.get("target_id")
        other = await _name_of(session, organization_id, "role_id", target) or await _name_of(
            session, organization_id, "member_id", target
        )
        return f"{source} → {other}" if source else ""
    if "member_id" in body:
        return await _name_of(session, organization_id, "member_id", body.get("member_id"))
    return next((str(body[f]).strip() for f in NAME_FIELDS if body.get(f)), "")


def action_for(request: Request) -> Action | None:
    route = request.scope.get("route")
    path = getattr(route, "path", "")
    return ACTIONS.get((request.method, path.removeprefix(PREFIX)))


async def audit_trail(
    request: Request,
    member: CurrentMember = Depends(get_current_member),
    session: AsyncSession = Depends(get_db),
) -> AsyncGenerator[None, None]:
    """Dipasang di router admin: mencatat tindakan yang berhasil."""
    action = None if request.method in SAFE_METHODS else action_for(request)
    if action is None:
        yield
        return
    target = await _describe(session, member, request)
    organization_id, user = member.organization_id, member.user
    yield
    # Hanya tercapai bila tindakannya berhasil
    try:
        add_entry(
            session,
            action=action.code,
            organization_id=organization_id,
            user=user,
            target=target,
            ip=request.client.host if request.client else "",
        )
        await session.commit()
    except Exception:
        logger.exception("Jejak audit gagal disimpan untuk %s", action.code)
