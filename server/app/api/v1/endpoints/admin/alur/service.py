"""Aturan alur aplikasi: siapa yang boleh, kapan boleh dijalankan, dan keputusan manusia."""

import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import MANAGERS, CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.alur import schema
from app.core import encryption
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnprocessableEntityException,
)
from app.models import (
    Agent,
    BrowserFlow,
    BrowserRun,
    BrowserRunEvent,
    Membership,
    Task,
    User,
    VaultAccount,
)
from app.models.base import utcnow
from app.models.browser.flow import ACTIVE_RUN_STATUSES
from app.services import two_factor
from app.services.browser import accounts, evidence, records
from app.services.browser.steps import describe, value_label, view_action
from app.services.engine import app_flow, decisions
from app.services.knowledge import storage

ROLE_NOT_FOUND = "Role tidak ditemukan."
FLOW_NOT_FOUND = "Alur tidak ditemukan."
RUN_NOT_FOUND = "Putaran tidak ditemukan."
NO_ACCESS = "Hanya penanggung jawab role, pemilik, atau admin yang dapat mengatur alur."
BUSY = "Masih ada putaran yang belum selesai."
NOT_APPROVED = "Alur belum disetujui."


@dataclass
class Scope:
    member: CurrentMember
    agent: Agent
    responsible: Membership | None

    @property
    def can_manage(self) -> bool:
        if self.member.access_role in MANAGERS:
            return True
        return self.member.access_role != "viewer" and self.is_responsible

    @property
    def is_responsible(self) -> bool:
        return self.responsible is not None and self.responsible.id == self.member.membership.id

    def require_manage(self) -> None:
        if not self.can_manage:
            raise ForbiddenException(NO_ACCESS)


async def _scope(session: AsyncSession, member: CurrentMember, agent_id: uuid.UUID) -> Scope:
    agent = await session.scalar(
        select(Agent).where(
            Agent.id == agent_id,
            Agent.organization_id == member.organization_id,
            Agent.deleted_at.is_(None),
        )
    )
    if agent is None:
        raise NotFoundException(ROLE_NOT_FOUND)
    responsible = (
        await session.get(Membership, agent.owner_member_id) if agent.owner_member_id else None
    )
    return Scope(member, agent, responsible)


async def _flow(
    session: AsyncSession, member: CurrentMember, flow_id: str, *, lock: bool = False
) -> tuple[Scope, BrowserFlow]:
    query = select(BrowserFlow).where(
        BrowserFlow.id == parse_id(flow_id, FLOW_NOT_FOUND),
        BrowserFlow.organization_id == member.organization_id,
    )
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    flow = await session.scalar(query)
    if flow is None:
        raise NotFoundException(FLOW_NOT_FOUND)
    return await _scope(session, member, flow.agent_id), flow


async def _manageable(
    session: AsyncSession, member: CurrentMember, flow_id: str
) -> tuple[Scope, BrowserFlow]:
    """Alur terkunci, boleh dikelola, dan tidak sedang menjalankan apa pun."""
    scope, flow = await _flow(session, member, flow_id, lock=True)
    scope.require_manage()
    if await records.active_run(session, flow.id):
        raise ConflictException(BUSY)
    return scope, flow


async def _usable_account(
    session: AsyncSession, scope: Scope, account_id: uuid.UUID | None
) -> VaultAccount:
    account = await session.get(VaultAccount, account_id) if account_id else None
    reason = accounts.problem(account, scope.agent, scope.responsible)
    if reason:
        raise ConflictException(reason)
    return account


async def _names(session: AsyncSession, member_ids: set) -> dict:
    wanted = {i for i in member_ids if i}
    if not wanted:
        return {}
    rows = await session.execute(
        select(Membership.id, User.full_name)
        .join(User, User.id == Membership.user_id)
        .where(Membership.id.in_(wanted))
    )
    return dict(rows.all())


def _summary(run: BrowserRun, names: dict) -> schema.RunSummary:
    return schema.RunSummary(
        id=str(run.id),
        mode=run.mode,
        status=run.status,
        message=run.message,
        flow_version=run.flow_version,
        created_by_name=names.get(run.created_by_member_id, "Sistem"),
        created_at=run.created_at,
        finished_at=run.finished_at,
    )


def _shot_url(run_id: object, no: int) -> str:
    return f"/api/v1/admin/alur-jalan/{run_id}/bukti/{no}"


def _inputs(flow: BrowserFlow, sees: bool) -> list[schema.FlowInput]:
    return [
        schema.FlowInput(**{**item, "sample": item["sample"] if sees else ""})
        for item in flow.inputs
    ]


def _base(flow: BrowserFlow, account_name: str | None) -> dict:
    return {
        "id": str(flow.id),
        "name": flow.name,
        "account_id": str(flow.account_id) if flow.account_id else None,
        "account_name": account_name or "",
        "status": flow.status,
        "version": flow.version,
        "trusted_submit": flow.trusted_submit,
        "successful_runs": flow.successful_runs,
        "updated_at": flow.updated_at,
    }


async def read_flows(session: AsyncSession, member: CurrentMember, role_id: str) -> schema.FlowList:
    scope = await _scope(session, member, parse_id(role_id, ROLE_NOT_FOUND))
    vault = list(
        await session.scalars(
            select(VaultAccount)
            .where(VaultAccount.agent_id == scope.agent.id)
            .order_by(func.lower(VaultAccount.name))
        )
    )
    names = {a.id: a.name for a in vault}
    flows = list(
        await session.scalars(
            select(BrowserFlow)
            .where(
                BrowserFlow.agent_id == scope.agent.id,
                BrowserFlow.organization_id == member.organization_id,
            )
            .order_by(func.lower(BrowserFlow.name))
        )
    )
    latest = {}
    if flows:
        rows = await session.scalars(
            select(BrowserRun)
            .where(BrowserRun.flow_id.in_([f.id for f in flows]))
            .distinct(BrowserRun.flow_id)
            .order_by(BrowserRun.flow_id, BrowserRun.created_at.desc())
        )
        latest = {run.flow_id: run for run in rows}
    people = await _names(session, {run.created_by_member_id for run in latest.values()})
    return schema.FlowList(
        flows=[
            schema.FlowListItem(
                **_base(flow, names.get(flow.account_id)),
                steps_count=len(flow.steps),
                inputs=_inputs(flow, scope.can_manage),
                last_run=_summary(latest[flow.id], people) if flow.id in latest else None,
            )
            for flow in flows
        ],
        accounts=[
            schema.AccountOption(
                id=str(a.id),
                name=a.name,
                locked=accounts.problem(a, scope.agent, scope.responsible) is not None,
            )
            for a in vault
        ],
        can_manage=scope.can_manage,
    )


async def _detail(session: AsyncSession, scope: Scope, flow: BrowserFlow) -> schema.FlowDetail:
    account = await session.get(VaultAccount, flow.account_id) if flow.account_id else None
    runs = list(
        await session.scalars(
            select(BrowserRun)
            .where(BrowserRun.flow_id == flow.id)
            .order_by(BrowserRun.created_at.desc())
            .limit(schema.RECENT_RUNS)
        )
    )
    people = await _names(
        session, {flow.approved_by_member_id, *(r.created_by_member_id for r in runs)}
    )
    active = await records.active_run(session, flow.id)
    # Isi akun orang lain hanya untuk yang boleh mengelola
    sees = scope.can_manage
    steps = [
        schema.FlowStep(
            no=number,
            action=view_action(step),
            description=describe(step),
            value_label=value_label(step, flow.inputs),
            risk=step["risk"],
            screenshot_url=_shot_url(*step["shot"]) if sees and step.get("shot") else None,
        )
        for number, step in enumerate(flow.steps, start=1)
    ]
    can_trust = (
        scope.is_responsible
        and scope.member.access_role != "viewer"
        and await two_factor.is_enabled(session, scope.member.user.id)
    )
    return schema.FlowDetail(
        **_base(flow, account.name if account else None),
        role_id=str(scope.agent.id),
        role_name=scope.agent.name,
        goal=flow.goal,
        inputs=_inputs(flow, sees),
        steps=steps,
        note=flow.note,
        approved_at=flow.approved_at,
        approved_by_name=people.get(flow.approved_by_member_id),
        active_run_id=str(active) if active else None,
        access=schema.FlowAccess(can_manage=sees, can_trust=can_trust),
        runs=[_summary(run, people) for run in runs],
        created_at=flow.created_at,
    )


async def read_flow(session: AsyncSession, member: CurrentMember, flow_id: str):
    return await _detail(session, *await _flow(session, member, flow_id))


async def create_flow(
    session: AsyncSession, member: CurrentMember, role_id: str, body: schema.LearnRequest
) -> tuple[schema.FlowDetail, str]:
    scope = await _scope(session, member, parse_id(role_id, ROLE_NOT_FOUND))
    scope.require_manage()
    try:
        account_id = uuid.UUID(body.account_id)
    except ValueError:
        raise UnprocessableEntityException("Pilih akun dari brankas role ini.") from None
    account = await session.get(VaultAccount, account_id)
    if account is None or account.agent_id != scope.agent.id:
        raise UnprocessableEntityException("Pilih akun dari brankas role ini.")
    await _usable_account(session, scope, account.id)
    flow = BrowserFlow(
        id=uuid.uuid4(),
        organization_id=member.organization_id,
        agent_id=scope.agent.id,
        account_id=account.id,
        name=body.name,
        goal=body.goal,
        inputs=[item.model_dump() for item in body.inputs],
        steps=[],
        status="learning",
        version=1,
        created_by_member_id=member.membership.id,
    )
    session.add(flow)
    await session.flush()
    run = records.new_run(flow, "learn", _samples(flow), member.membership.id)
    session.add(run)
    await session.commit()
    return await _detail(session, scope, flow), str(run.id)


def _samples(flow: BrowserFlow) -> dict:
    return {item["key"]: item["sample"] for item in flow.inputs}


async def relearn(
    session: AsyncSession, member: CurrentMember, flow_id: str, body: schema.FlowBody
) -> tuple[schema.FlowDetail, str]:
    scope, flow = await _manageable(session, member, flow_id)
    await _usable_account(session, scope, flow.account_id)
    mode = "repair" if flow.status == "needs_repair" else "learn"
    flow.name = body.name
    flow.goal = body.goal
    flow.inputs = [item.model_dump() for item in body.inputs]
    flow.version += 1
    records.reset_approval(flow)
    flow.status = "learning"
    flow.note = ""
    run = records.new_run(flow, mode, _samples(flow), member.membership.id)
    session.add(run)
    await session.commit()
    return await _detail(session, scope, flow), str(run.id)


async def approve(
    session: AsyncSession, member: CurrentMember, flow_id: str, version: int
) -> schema.FlowDetail:
    scope, flow = await _manageable(session, member, flow_id)
    if flow.status != "review":
        raise ConflictException("Alur ini tidak sedang menunggu diperiksa.")
    if flow.version != version:
        raise ConflictException("Alur sudah berubah. Muat ulang lalu periksa lagi.")
    flow.status = "approved"
    flow.note = ""
    flow.approved_at = utcnow()
    flow.approved_by_member_id = member.membership.id
    flow.updated_at = utcnow()
    await session.commit()
    return await _detail(session, scope, flow)


async def start_run(
    session: AsyncSession, member: CurrentMember, flow_id: str, given: dict[str, str]
) -> tuple[schema.RunDetail, str]:
    scope, flow = await _manageable(session, member, flow_id)
    if flow.status != "approved":
        raise ConflictException(NOT_APPROVED)
    await _usable_account(session, scope, flow.account_id)
    values = {item["key"]: given.get(item["key"], "").strip() for item in flow.inputs}
    missing = [item["label"] for item in flow.inputs if not values[item["key"]]]
    if missing:
        raise UnprocessableEntityException(f"Isian belum lengkap: {', '.join(missing)}.")
    if any(len(value) > schema.MAX_VALUE for value in values.values()):
        raise UnprocessableEntityException(f"Isian maksimal {schema.MAX_VALUE} karakter.")
    run = records.new_run(flow, "replay", values, member.membership.id)
    session.add(run)
    await session.commit()
    return await _run_detail(session, scope, flow, run), str(run.id)


async def set_trust(
    session: AsyncSession, member: CurrentMember, flow_id: str, body: schema.TrustRequest
) -> schema.FlowDetail:
    scope, flow = await _manageable(session, member, flow_id)
    if (
        not scope.is_responsible
        or member.access_role == "viewer"
        or not (await two_factor.is_enabled(session, member.user.id))
    ):
        raise ForbiddenException(
            "Hanya penanggung jawab role dengan verifikasi dua langkah yang dapat mengubah ini."
        )
    if body.enabled:
        if flow.status != "approved":
            raise ConflictException(NOT_APPROVED)
        if flow.successful_runs < schema.TRUST_AFTER_RUNS:
            raise ConflictException(f"Perlu {schema.TRUST_AFTER_RUNS} putaran berhasil lebih dulu.")
        await _usable_account(session, scope, flow.account_id)
    await two_factor.require_code(session, member.user.id, body.code)
    flow.trusted_submit = body.enabled
    flow.updated_at = utcnow()
    await session.commit()
    return await _detail(session, scope, flow)


async def delete_flow(session: AsyncSession, member: CurrentMember, flow_id: str) -> None:
    _, flow = await _manageable(session, member, flow_id)
    organization_id, wanted = flow.organization_id, flow.id
    await session.delete(flow)
    await session.commit()
    evidence.delete_flow(organization_id, wanted)


async def _run(
    session: AsyncSession, member: CurrentMember, run_id: str, *, lock: bool = False
) -> tuple[Scope, BrowserFlow, BrowserRun]:
    wanted = parse_id(run_id, RUN_NOT_FOUND)
    mine = select(BrowserRun).where(
        BrowserRun.id == wanted, BrowserRun.organization_id == member.organization_id
    )
    run = await session.scalar(mine)
    if run is None:
        raise NotFoundException(RUN_NOT_FOUND)
    if lock:
        # Tugas pemiliknya ikut terkunci, lebih dulu daripada putarannya
        _, run = await records.lock_run_and_task(session, wanted)
    flow = await session.get(BrowserFlow, run.flow_id)
    return await _scope(session, member, flow.agent_id), flow, run


async def _run_detail(
    session: AsyncSession, scope: Scope, flow: BrowserFlow, run: BrowserRun
) -> schema.RunDetail:
    events = list(
        await session.scalars(
            select(BrowserRunEvent)
            .where(BrowserRunEvent.run_id == run.id)
            .order_by(BrowserRunEvent.no)
        )
    )
    people = await _names(session, {run.created_by_member_id})
    sees = scope.can_manage
    pending = None
    if sees and run.pending:
        shot = run.pending.get("shot")
        pending = schema.RunPending(
            kind=run.pending["kind"],
            question=run.pending["question"],
            values=run.pending.get("values", []),
            screenshot_url=_shot_url(run.id, shot) if shot else None,
            expires_at=run.pending.get("expires_at"),
        )
    labels = {item["key"]: item["label"] for item in flow.inputs}
    return schema.RunDetail(
        **_summary(run, people).model_dump(),
        flow_id=str(flow.id),
        flow_name=flow.name,
        role_id=str(scope.agent.id),
        role_name=scope.agent.name,
        inputs=[
            schema.NamedValue(label=labels.get(key, key), value=value)
            for key, value in run.inputs.items()
        ]
        if sees
        else [],
        events=[
            schema.RunEvent(
                no=e.no,
                step_no=e.step_no,
                message=e.message,
                status=e.status,
                screenshot_url=_shot_url(run.id, e.no) if sees and e.has_screenshot else None,
                created_at=e.created_at,
            )
            for e in events
        ],
        outputs=run.outputs if sees else [],
        pending=pending,
        can_decide=sees,
    )


async def read_run(session: AsyncSession, member: CurrentMember, run_id: str):
    return await _run_detail(session, *await _run(session, member, run_id))


async def decide(
    session: AsyncSession, member: CurrentMember, run_id: str, decision: str
) -> tuple[schema.RunDetail, str | None]:
    scope, flow, run = await _run(session, member, run_id, lock=True)
    scope.require_manage()
    if run.status != "waiting_approval":
        raise ConflictException("Putaran ini tidak sedang menunggu persetujuan.")
    if run.task_id:
        return await _decide_for_task(session, scope, flow, run, decision)
    name = member.user.full_name
    queued = None
    if decision == "rejected":
        message = "Ditolak. Tidak ada yang dikirim."
        await records.add_event(session, run, f"Ditolak {name}. Tidak ada yang dikirim.", "blocked")
        run.status, run.message, run.pending = "stopped", message, None
        run.finished_at = utcnow()
    else:
        if flow.status != "approved" or flow.version != run.flow_version:
            raise ConflictException(records.OUTDATED)
        await _usable_account(session, scope, flow.account_id)
        await records.add_event(session, run, f"Disetujui {name}.", "done")
        run.approved_step = run.pending["step_no"]
        run.approved_by_member_id = member.membership.id
        run.status, run.message, run.pending = "queued", "", None
        queued = str(run.id)
    await session.commit()
    return await _run_detail(session, scope, flow, run), queued


async def _decide_for_task(
    session: AsyncSession, scope: Scope, flow: BrowserFlow, run: BrowserRun, decision: str
) -> tuple[schema.RunDetail, str | None]:
    """Sama dengan memutuskan persetujuan tugasnya, termasuk jejak dan akibatnya."""
    task = await session.get(Task, run.task_id)
    approval = await app_flow.pending_approval(session, task.id, run.id)
    if approval is None:
        raise ConflictException(app_flow.NOT_WAITING)
    comment = "" if decision == "approved" else "Ditolak dari halaman putaran."
    await decisions.decide(session, task, approval, decision, comment, scope.member.membership)
    await session.commit()
    queued = str(run.id) if decision == "approved" else None
    return await _run_detail(session, scope, flow, run), queued


async def send_otp(
    session: AsyncSession, member: CurrentMember, run_id: str, code: str
) -> schema.RunDetail:
    scope, flow, run = await _run(session, member, run_id, lock=True)
    scope.require_manage()
    if run.status != "waiting_otp":
        raise ConflictException("Putaran ini tidak sedang menunggu kode.")
    if run.otp_encrypted:
        raise ConflictException("Kode sudah dikirim. Tunggu sebentar.")
    run.otp_encrypted = encryption.encrypt(code, records.otp_context(run.id))
    await records.add_event(session, run, "Kode OTP diterima.", "done")
    await session.commit()
    return await _run_detail(session, scope, flow, run)


async def stop(session: AsyncSession, member: CurrentMember, run_id: str) -> schema.RunDetail:
    scope, flow, run = await _run(session, member, run_id, lock=True)
    scope.require_manage()
    if run.status not in ACTIVE_RUN_STATUSES:
        raise ConflictException("Putaran sudah selesai.")
    message = "Dihentikan pengguna."
    if run.submitted_at:
        message = f"{message} Tombol sudah sempat ditekan; periksa aplikasinya."
    await records.add_event(session, run, message, "blocked")
    run.status, run.message, run.pending, run.otp_encrypted = "stopped", message, None, None
    run.finished_at = utcnow()
    if flow.status == "learning":
        flow.status = "needs_repair" if run.mode == "repair" else "failed"
        flow.note = "Belajar dihentikan."
        flow.updated_at = utcnow()
    if run.task_id:
        await app_flow.sync(session, await session.get(Task, run.task_id), run)
    await session.commit()
    return await _run_detail(session, scope, flow, run)


async def evidence_file(
    session: AsyncSession, member: CurrentMember, run_id: str, number: int
) -> Path:
    scope, flow, run = await _run(session, member, run_id)
    scope.require_manage()
    found = await session.scalar(
        select(BrowserRunEvent.id).where(
            BrowserRunEvent.run_id == run.id,
            BrowserRunEvent.no == number,
            BrowserRunEvent.has_screenshot.is_(True),
        )
    )
    path = storage.path_of(evidence.relative(run.organization_id, flow.id, run.id, number))
    if found is None or not path.is_file():
        raise NotFoundException("Tangkapan layar tidak ditemukan.")
    return path
