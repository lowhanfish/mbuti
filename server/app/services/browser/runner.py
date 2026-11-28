"""Menjalankan satu putaran dari antrean: kunci, buka aplikasi, simpan hasil, beri tahu."""

import asyncio
import datetime
import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core import encryption
from app.core.config import settings
from app.core.exceptions import AppException
from app.models import (
    Agent,
    BrowserFlow,
    BrowserRun,
    Membership,
    User,
    VaultAccount,
)
from app.models.base import utcnow
from app.models.tugas.task import OPEN_STATUSES
from app.services import budget, mailer
from app.services.browser import accounts
from app.services.browser.learn import learn
from app.services.browser.records import (
    OUTDATED,
    add_event,
    close,
    lock_run,
    lock_run_and_task,
    new_run,
    otp_context,
    reset_approval,
)
from app.services.browser.replay import replay
from app.services.browser.session import Cancelled, Outcome, Stop, open_session
from app.services.browser.steps import describe
from app.services.engine import app_flow
from app.services.engine.dispatch import enqueue_task
from app.services.engine.runner import Caller, generate_with_fallback
from app.services.llm.generation import LlmProvider

logger = logging.getLogger("mbuti.browser")

Sessions = async_sessionmaker[AsyncSession]
OTP_POLL_SECONDS = 2.0
MODEL_RETRIES = 3
MODEL_RETRY_SECONDS = 20
# Putaran tanpa kabar selama ini dianggap ditinggalkan worker
STALE_AFTER = datetime.timedelta(minutes=10)
REQUEUE_AFTER = datetime.timedelta(minutes=5)
UNEXPECTED = "Terjadi kesalahan saat membuka aplikasi. Coba lagi."
ABANDONED = "Putaran terputus sebelum selesai. Jalankan lagi."
MAYBE_SENT = (
    "Putaran terputus sesudah tombol ditekan. Mungkin sudah terkirim: periksa aplikasinya "
    "sebelum menjalankan lagi."
)
LEARNED = "Alur tersusun. Periksa langkahnya lalu setujui."


async def notice(session: AsyncSession, run: BrowserRun, message: str) -> mailer.Email | None:
    """Email untuk penanggung jawab role; diantrekan pemanggil sesudah commit."""
    row = (
        await session.execute(
            select(User.email, User.full_name, BrowserFlow.name)
            .select_from(BrowserFlow)
            .join(Agent, Agent.id == BrowserFlow.agent_id)
            .join(Membership, Membership.id == Agent.owner_member_id)
            .join(User, User.id == Membership.user_id)
            .where(BrowserFlow.id == run.flow_id, Membership.status == "active")
        )
    ).first()
    if row is None:
        return None
    return mailer.browser_notice(row.email, row.full_name, row.name, message, str(run.id))


class DbHooks:
    """Setiap tindakan memakai transaksi pendek dan memeriksa apakah putaran dihentikan."""

    def __init__(self, sessions: Sessions, run_id: uuid.UUID):
        self.sessions = sessions
        self.run_id = run_id

    async def _alive(self, session: AsyncSession) -> BrowserRun:
        run = await lock_run(session, self.run_id)
        if run is None or run.status not in ("running", "waiting_otp"):
            raise Cancelled
        run.claimed_at = utcnow()
        return run

    async def event(
        self, message: str, status: str = "done", step_no: int | None = None, shot=None
    ) -> int:
        async with self.sessions() as session:
            run = await self._alive(session)
            number = await add_event(session, run, message, status, step_no, shot)
            await session.commit()
        return number

    async def checkpoint(self) -> None:
        async with self.sessions() as session:
            await self._alive(session)
            await session.commit()

    async def before_risk(self) -> None:
        async with self.sessions() as session:
            run = await self._alive(session)
            run.submitted_at = utcnow()
            await session.commit()

    async def wait_otp(self, question: str, shot) -> str | None:
        wait = datetime.timedelta(seconds=settings.BROWSER_OTP_WAIT_SECONDS)
        until = utcnow() + wait
        async with self.sessions() as session:
            task, _ = await lock_run_and_task(session, self.run_id)
            run = await self._alive(session)
            number = await add_event(
                session, run, "Menunggu kode OTP dari pemilik.", "waiting", None, shot
            )
            run.status = "waiting_otp"
            run.otp_encrypted = None
            run.pending = {
                "kind": "otp",
                "question": question,
                "values": [],
                "shot": number,
                "expires_at": until.isoformat(),
            }
            await app_flow.sync(session, task, run)
            email = await notice(session, run, question)
            await session.commit()
        if email:
            mailer.queue(email)
        while utcnow() < until:
            await asyncio.sleep(OTP_POLL_SECONDS)
            async with self.sessions() as session:
                run = await self._alive(session)
                if run.otp_encrypted:
                    code = encryption.decrypt(run.otp_encrypted, otp_context(run.id))
                    run.otp_encrypted = None
                    run.pending = None
                    run.status = "running"
                    await session.commit()
                    return code
                await session.commit()
        async with self.sessions() as session:
            run = await self._alive(session)
            run.pending = None
            run.status = "running"
            await session.commit()
        return None


@dataclass
class Job:
    organization_id: uuid.UUID
    agent_id: uuid.UUID
    flow_id: uuid.UUID
    account_id: uuid.UUID
    user_id: uuid.UUID | None
    mode: str
    goal: str
    inputs: list[dict]
    steps: list[dict]
    given: dict[str, str]
    approved_step: int | None
    trusted: bool
    creds: object
    state: dict | None


async def _claim(sessions: Sessions, run_id: uuid.UUID) -> Job | None:
    """Ambil putaran yang antre. Yang tidak bisa dijalankan langsung ditutup."""
    email = None
    async with sessions() as session:
        task, run = await lock_run_and_task(session, run_id)
        if run is None or run.status != "queued":
            return None
        run.status = "running"
        run.pending = None
        run.claimed_at = utcnow()
        run.started_at = run.started_at or utcnow()
        flow = await session.get(BrowserFlow, run.flow_id)
        agent = await session.get(Agent, flow.agent_id)
        account = await session.get(VaultAccount, flow.account_id) if flow.account_id else None
        responsible = (
            await session.get(Membership, agent.owner_member_id) if agent.owner_member_id else None
        )
        reason = None
        if run.task_id and (task is None or task.status not in OPEN_STATUSES):
            close(run, "stopped", "Tugas sudah berakhir.")
            await session.commit()
            return None
        if run.submitted_at is not None:
            reason = MAYBE_SENT
        elif agent.deleted_at is not None:
            reason = "Role sudah dihapus."
        elif run.mode == "replay" and (
            flow.status != "approved" or flow.version != run.flow_version
        ):
            reason = OUTDATED
        else:
            reason = accounts.problem(account, agent, responsible)
        if reason:
            await add_event(session, run, reason, "failed")
            close(run, "failed", reason)
            _learning_failed(flow, run, reason)
            await app_flow.sync(session, task, run)
            email = await notice(session, run, reason)
            await session.commit()
        else:
            user_id = None
            if run.created_by_member_id:
                member = await session.get(Membership, run.created_by_member_id)
                user_id = member.user_id if member else None
            job = Job(
                organization_id=run.organization_id,
                agent_id=agent.id,
                flow_id=flow.id,
                account_id=account.id,
                user_id=user_id,
                mode=run.mode,
                goal=flow.goal,
                inputs=flow.inputs,
                steps=flow.steps,
                given=run.inputs,
                approved_step=run.approved_step,
                trusted=flow.trusted_submit and not run.force_approval,
                creds=accounts.credentials(account),
                state=accounts.stored_session(account) if run.mode == "replay" else None,
            )
            await session.commit()
            return job
    if email:
        mailer.queue(email)
    return None


def _learning_failed(flow: BrowserFlow, run: BrowserRun, message: str) -> None:
    if run.mode != "replay" and flow.status == "learning":
        # Perbaikan yang gagal tetap menunggu diperbaiki; belajar pertama dianggap gagal
        flow.status = "needs_repair" if run.mode == "repair" else "failed"
        flow.note = message[:500]
        flow.updated_at = utcnow()


def _asker(sessions: Sessions, job: Job, llm: LlmProvider):
    async def ask(system: str, user: str, schema: dict) -> dict:
        for attempt in range(MODEL_RETRIES):
            try:
                async with sessions() as session:
                    await budget.require_budget(session, job.organization_id)
                    models = (await budget.read_settings(session, job.organization_id)).models
                    generation, _, _ = await generate_with_fallback(
                        session,
                        Caller(job.organization_id, job.user_id, "browser"),
                        job.agent_id,
                        llm,
                        [models["balanced"], models["fallback"]],
                        system,
                        user,
                        schema,
                    )
                return generation.data
            except AppException as exc:
                if exc.status_code != 503 or attempt == MODEL_RETRIES - 1:
                    raise Stop(exc.message) from None
                await asyncio.sleep(MODEL_RETRY_SECONDS)
        raise Stop("Model AI sedang tidak tersedia.")

    return ask


@dataclass
class Result:
    outcome: Outcome
    state: dict | None = None
    # True: sesi tersimpan harus dibuang
    forget_session: bool = False
    login_failed: bool = False


async def _drive(job: Job, hooks: DbHooks, ask, state: dict | None) -> Result:
    async with open_session(job.creds, hooks, state) as browser:
        try:
            if job.mode == "replay":
                outcome = await replay(
                    browser,
                    job.steps,
                    job.inputs,
                    job.given,
                    approved_step=job.approved_step,
                    trusted=job.trusted,
                    resumed_session=state is not None,
                )
            else:
                previous = (
                    [f"- {describe(step)}" for step in job.steps] if job.mode == "repair" else None
                )
                outcome = await learn(browser, ask, job.goal, job.inputs, previous)
        except Stop as stop:
            await hooks.event(stop.message, "failed", None, await browser.screenshot())
            return Result(
                Outcome(stop.status, stop.message),
                forget_session=stop.login_failed,
                login_failed=stop.login_failed,
            )
        keep = browser.logged_in or (state is not None and not outcome.retry_fresh)
        return Result(outcome, state=await browser.state() if keep else None)


async def execute(
    sessions: Sessions, run_id: uuid.UUID, llm_provider: Callable[[], LlmProvider]
) -> str | None:
    """Kerjakan satu putaran. Mengembalikan ID putaran perbaikan yang perlu diantrekan."""
    job = await _claim(sessions, run_id)
    if job is None:
        return None
    hooks = DbHooks(sessions, run_id)
    try:
        ask = None if job.mode == "replay" else _asker(sessions, job, llm_provider())
        result = await _drive(job, hooks, ask, job.state)
        if result.outcome.retry_fresh:
            await hooks.event("Sesi tersimpan tidak berlaku, masuk ulang.", "failed")
            result = await _drive(job, hooks, ask, None)
            result.forget_session = result.state is None
    except Cancelled:
        return None
    except Exception as exc:
        # Pesan dan jejak galat peramban bisa memuat password: hanya jenisnya yang dicatat
        logger.error("Putaran %s gagal: %s", run_id, type(exc).__name__)
        result = Result(Outcome("failed", UNEXPECTED))
    return await _finish(sessions, run_id, job, result)


async def _finish(sessions: Sessions, run_id: uuid.UUID, job: Job, result: Result) -> str | None:
    outcome = result.outcome
    email, follow_up = None, None
    async with sessions() as session:
        task, run = await lock_run_and_task(session, run_id)
        if run is None:
            return None
        flow = await session.get(BrowserFlow, run.flow_id)
        account = await session.get(VaultAccount, job.account_id)
        if account is not None:
            if result.login_failed:
                account.login_blocked_at = utcnow()
            if result.forget_session:
                accounts.keep_session(account, None)
            elif result.state is not None:
                accounts.keep_session(account, result.state)
            if outcome.status == "succeeded":
                account.last_used_at = utcnow()
        # Dihentikan pengguna saat langkah terakhir berjalan: keputusannya tidak ditimpa
        if run.status not in ("running", "waiting_otp"):
            await session.commit()
            return None
        run.outputs = outcome.outputs
        if outcome.status == "waiting_approval":
            run.status = "waiting_approval"
            run.pending = outcome.pending
            run.message = "Menunggu persetujuan."
            run.claimed_at = None
            email = await notice(session, run, outcome.pending["question"])
        elif outcome.status == "succeeded" and run.mode != "replay":
            used = {step["key"] for step in outcome.steps if step["source"] == "input"}
            unused = [i["label"] for i in flow.inputs if i["key"] not in used]
            flow.steps = [
                {**step, "shot": [str(run.id), step["shot"]] if step["shot"] else None}
                for step in outcome.steps
            ]
            flow.status = "review"
            flow.note = (
                f"Isian ini tidak terpakai: {', '.join(unused)}. Periksa sebelum menyetujui."[:500]
                if unused
                else ""
            )
            flow.updated_at = utcnow()
            close(run, "succeeded", LEARNED)
        elif outcome.status == "succeeded":
            flow.successful_runs += 1
            flow.updated_at = utcnow()
            close(run, "succeeded", outcome.message)
        elif outcome.status == "needs_repair":
            close(run, "needs_repair", outcome.message)
            email = await notice(session, run, outcome.message)
            if flow.status == "approved" and flow.version == run.flow_version:
                follow_up = _start_repair(session, flow, outcome.message)
        else:
            close(run, "failed", outcome.message)
            _learning_failed(flow, run, outcome.message)
            email = await notice(session, run, outcome.message)
        await app_flow.sync(session, task, run)
        completed = task is not None and task.status == "completed"
        await session.commit()
    if email:
        mailer.queue(email)
    if completed:
        # Nomor dan berkas surat dibuat worker eksekusi sesudah tugasnya selesai
        await enqueue_task(task.id)
    return follow_up


def _start_repair(session: AsyncSession, flow: BrowserFlow, reason: str) -> str:
    """Satu percobaan perbaikan otomatis; hasilnya menunggu diperiksa manusia."""
    flow.version += 1
    reset_approval(flow)
    flow.status = "learning"
    flow.note = reason[:500]
    run = new_run(flow, "repair", {i["key"]: i["sample"] for i in flow.inputs}, None)
    session.add(run)
    return str(run.id)


async def recover(sessions: Sessions) -> list[str]:
    """Tutup putaran yang ditinggalkan worker dan kirim ulang yang pesannya hilang."""
    emails = []
    old = (
        BrowserRun.status.in_(("running", "waiting_otp")),
        BrowserRun.claimed_at < utcnow() - STALE_AFTER,
    )
    async with sessions() as session:
        stale = list(await session.scalars(select(BrowserRun.id).where(*old)))
    for run_id in stale:
        async with sessions() as session:
            task, run = await lock_run_and_task(session, run_id)
            # Bisa sudah selesai atau memberi kabar sementara dikunci
            if run is None or not await session.scalar(
                select(BrowserRun.id).where(BrowserRun.id == run_id, *old)
            ):
                continue
            message = MAYBE_SENT if run.submitted_at else ABANDONED
            await add_event(session, run, message, "failed")
            close(run, "failed", message)
            _learning_failed(await session.get(BrowserFlow, run.flow_id), run, message)
            await app_flow.sync(session, task, run)
            emails.append(await notice(session, run, message))
            await session.commit()
    async with sessions() as session:
        waiting = await session.scalars(
            select(BrowserRun.id).where(
                BrowserRun.status == "queued", BrowserRun.created_at < utcnow() - REQUEUE_AFTER
            )
        )
        queued = [str(run_id) for run_id in waiting]
        await session.commit()
    for email in filter(None, emails):
        mailer.queue(email)
    return queued
