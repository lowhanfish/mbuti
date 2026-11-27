"""
Satu putaran kerja tugas, dijalankan worker: menilai rute yang tertunda atau mengerjakan satu
langkah. Model dipanggil di luar transaksi, lalu hasilnya disimpan setelah baris tugas dikunci
kembali; bila tugas sudah dihentikan di antaranya, hasilnya dibuang.
"""

import datetime
import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.exceptions import AppException, ConflictException
from app.models import Agent, AgentRelation, Citation, Task, TaskAttachment, TaskStep
from app.models.base import utcnow
from app.models.tugas.task import OPEN_STATUSES
from app.services import budget
from app.services.engine import flow, routing
from app.services.engine.images import ImageInput, attachment_images
from app.services.engine.runner import Caller, RunResult, evaluate_condition, run_agent
from app.services.llm.embedding import EmbeddingProvider
from app.services.llm.generation import LlmProvider

logger = logging.getLogger("mbuti.execution")

# Langkah yang berjalan lebih lama dari ini dianggap ditinggalkan worker yang mati
STALE_AFTER = datetime.timedelta(minutes=10)
# Percobaan saat model tidak tersedia, dan saat jawabannya tidak terbaca
UNAVAILABLE_TRIES = 6
UNREADABLE_TRIES = 2
RETRY_SECONDS = 60
CONSULT_OFFSET = 0.5
KIND_VERB = {"work": "bekerja", "review": "memeriksa", "consult": "memberi masukan"}


class RetryLater(Exception):
    def __init__(self, seconds: int):
        super().__init__(seconds)
        self.seconds = seconds


@dataclass
class Providers:
    llm: LlmProvider
    embedder: EmbeddingProvider


Sessions = async_sessionmaker[AsyncSession]


def _caller(task: Task, kind: str, step_id: uuid.UUID | None) -> Caller:
    return Caller(task.organization_id, task.created_by, kind, task.id, step_id)


def _task_text(task: Task) -> str:
    return "\n".join([task.title, task.brief, *task.inputs.values()])


async def _judge(
    sessions: Sessions,
    task: Task,
    step_id: uuid.UUID,
    relations: list[AgentRelation],
    material: str,
    providers: Providers,
) -> tuple[dict[str, tuple[bool, str]], int]:
    """Nilai relasi bersyarat satu per satu, di luar transaksi tugas."""
    results: dict[str, tuple[bool, str]] = {}
    total = 0
    for relation in relations:
        if relation.trigger != "on_condition":
            continue
        async with sessions() as session:
            met, reason, cost = await evaluate_condition(
                session,
                _caller(task, "condition", step_id),
                relation.source_agent_id,
                relation.condition,
                material,
                providers.llm,
            )
        results[str(relation.id)] = (met, reason)
        total += cost
    return results, total


async def _run_pending_route(sessions: Sessions, task: Task, providers: Providers) -> None:
    job = task.pending_routes[0]
    step_id = uuid.UUID(job["step_id"])
    skip = uuid.UUID(job["skip_relation_id"]) if job.get("skip_relation_id") else None
    async with sessions() as session:
        source = await session.get(TaskStep, step_id)
        relations = await routing.outgoing(session, source.agent_id, job["trigger"], skip)
        material = f"{_task_text(task)}\n\nHasil:\n{source.output}"
    conditions, cost = await _judge(sessions, task, step_id, relations, material, providers)

    async with sessions() as session:
        locked = await flow.lock_task(session, task.id)
        locked.cost_used += cost
        # Dihentikan atau sudah diambil worker lain sementara dinilai
        if locked.status in OPEN_STATUSES and job in locked.pending_routes:
            remaining = list(locked.pending_routes)
            remaining.remove(job)
            locked.pending_routes = remaining
            source = await session.get(TaskStep, step_id)
            if locked.cost_used > locked.budget_limit:
                await flow.halt(
                    session,
                    locked,
                    "stopped_budget",
                    "Biaya mencapai batas tugas. Tugas dihentikan otomatis.",
                    step_id,
                )
            else:
                await routing.route(session, locked, source, job["trigger"], conditions, skip)
                await flow.settle(session, locked)
        await session.commit()


async def _claim(sessions: Sessions, task_id: uuid.UUID) -> tuple[Task, TaskStep | None] | None:
    """
    Kunci tugas lalu ambil pekerjaan berikutnya: (tugas, None) untuk rute tertunda,
    (tugas, langkah) untuk langkah, atau None bila tidak ada yang bisa dikerjakan.
    """
    async with sessions() as session:
        task = await flow.lock_task(session, task_id)
        if task is None or task.status not in ("queued", "running"):
            return None
        if task.pending_routes:
            await session.commit()
            return task, None
        steps = list(
            await session.scalars(
                select(TaskStep)
                .where(
                    TaskStep.task_id == task.id,
                    TaskStep.status.in_(flow.RUNNABLE),
                    TaskStep.queue_no.is_not(None),
                )
                .order_by(TaskStep.queue_no, TaskStep.seq)
            )
        )
        running = next((s for s in steps if s.status == "running"), None)
        if running is not None:
            if running.claimed_at and utcnow() - running.claimed_at < STALE_AFTER:
                return None
            running.status = "queued"
            steps = sorted(steps, key=lambda s: (s.queue_no, s.seq))
        if not steps:
            await flow.settle(session, task)
            await session.commit()
            return None
        step = steps[0]

        settings = await budget.read_settings(session, task.organization_id)
        if step.started_at is None:
            started = await session.scalar(
                select(func.count())
                .select_from(TaskStep)
                .where(TaskStep.task_id == task.id, TaskStep.started_at.is_not(None))
            )
            if started >= settings.max_steps_per_task:
                await flow.halt(
                    session,
                    task,
                    "failed",
                    f"Batas {settings.max_steps_per_task} langkah tercapai. Tugas dihentikan "
                    "untuk mencegah putaran tanpa akhir.",
                )
                await session.commit()
                return None
        if (await budget.month_usage(session, task.organization_id)).remaining <= 0:
            await flow.halt(
                session,
                task,
                "stopped_budget",
                "Anggaran bulanan organisasi habis. Tugas dihentikan sebelum langkah berikutnya.",
            )
            await session.commit()
            return None
        step.status = "running"
        step.claimed_at = utcnow()
        task.updated_at = utcnow()
        await session.commit()
        return task, step


async def _expand_consults(
    sessions: Sessions, task: Task, step: TaskStep, providers: Providers
) -> bool:
    """
    Jalankan konsultasi milik role sebelum ia bekerja. True bila langkah ini ditunda
    (konsultasi masuk antrean lebih dulu, atau menunggu izin).
    """
    async with sessions() as session:
        relations = list(
            await session.scalars(
                select(AgentRelation)
                .where(
                    AgentRelation.source_agent_id == step.agent_id,
                    AgentRelation.deleted_at.is_(None),
                    AgentRelation.relation_type == "consult",
                    AgentRelation.trigger.in_(("on_complete", "on_condition")),
                )
                .order_by(AgentRelation.created_at, AgentRelation.id)
            )
        )
    conditions, cost = await _judge(sessions, task, step.id, relations, _task_text(task), providers)

    async with sessions() as session:
        locked = await flow.lock_task(session, task.id)
        locked.cost_used += cost
        current = await session.get(TaskStep, step.id)
        if locked.status not in OPEN_STATUSES or current.status != "running":
            await session.commit()
            return True
        current.consults_expanded = True
        applicable = []
        for relation in relations:
            label = relation.label or relation.relation_type
            met, reason = conditions.get(str(relation.id), (True, ""))
            if not met:
                flow.log(
                    session,
                    locked,
                    "relation_skipped",
                    f'Kondisi tidak terpenuhi, relasi "{label}" dilewati: {reason}',
                    current.id,
                )
            elif await routing.active_target(session, locked, relation, current):
                applicable.append(relation)
        if not applicable:
            await session.commit()
            return False

        current.status = "queued"
        original = current.queue_no
        gated = [r for r in applicable if r.requires_approval]
        for number, relation in enumerate(r for r in applicable if not r.requires_approval):
            await flow.add_step(
                session,
                locked,
                relation.target_agent_id,
                "consult",
                via_relation_id=relation.id,
                parent_step_id=current.id,
                input_notes=relation.expected_output,
                queue_no=original - CONSULT_OFFSET + number / 1000,
            )
        for number, relation in enumerate(gated):
            asker = await flow.agent_name(session, relation.source_agent_id)
            target = await flow.agent_name(session, relation.target_agent_id)
            await flow.request_approval(
                session,
                locked,
                step_id=current.id,
                reason="requires_approval",
                question=f"Boleh {asker} berkonsultasi dengan {target} sebelum bekerja?",
                requested_from=await flow.owner_of(session, relation.source_agent_id, locked),
                follow_up={
                    "type": "run_consult",
                    "relation_id": str(relation.id),
                    "step_id": str(current.id),
                    "queue_no": original,
                    "consult_queue_no": original - CONSULT_OFFSET / 2 + number / 1000,
                },
            )
        if gated:
            # Ditahan di luar antrean sampai semua izin diputuskan
            current.queue_no = None
        if locked.cost_used > locked.budget_limit:
            await flow.halt(
                session,
                locked,
                "stopped_budget",
                "Biaya mencapai batas tugas. Tugas dihentikan otomatis.",
                current.id,
            )
        await flow.settle(session, locked)
        await session.commit()
        return True


async def _attachments(session: AsyncSession, task: Task, step: TaskStep) -> list[ImageInput]:
    """Lampiran tugas untuk role pertama, dan untuk penerima relasi yang membawa konteks."""
    if step.via_relation_id is not None:
        relation = await session.get(AgentRelation, step.via_relation_id)
        if relation is None or relation.payload_spec != "result_context":
            return []
    ids = list(
        await session.scalars(
            select(TaskAttachment.id)
            .where(TaskAttachment.task_id == task.id)
            .order_by(TaskAttachment.created_at)
        )
    )
    return await attachment_images(session, task.organization_id, ids)


async def _materials(session: AsyncSession, step: TaskStep) -> list[tuple[str, str]]:
    """Bahan dari langkah sebelumnya yang diberikan kepada role."""
    materials: list[tuple[str, str]] = []
    parent = await session.get(TaskStep, step.parent_step_id) if step.parent_step_id else None
    relation = (
        await session.get(AgentRelation, step.via_relation_id) if step.via_relation_id else None
    )
    payload = relation.payload_spec if relation else "result_context"

    async def references(source: TaskStep) -> None:
        rows = await session.scalars(
            select(Citation).where(Citation.step_id == source.id).order_by(Citation.order_no)
        )
        lines = [
            f"[{c.order_no}] {c.document_title} v{c.version_no}, halaman {c.page_no}: {c.snippet}"
            for c in rows
        ]
        if lines:
            materials.append(("Rujukan yang dipakai pembuat", "\n".join(lines)))

    if step.kind == "review" and parent is not None:
        maker = await session.get(Agent, parent.agent_id)
        materials.append((f"Hasil {maker.name} yang diperiksa", parent.output))
        if maker.acceptance_criteria:
            criteria = "\n".join(f"- {item}" for item in maker.acceptance_criteria)
            materials.append(("Kriteria hasil pembuat", criteria))
        if payload == "references":
            await references(parent)
    elif step.kind == "consult" and parent is not None:
        asker = await flow.agent_name(session, parent.agent_id)
        materials.append(("Penanya", f"{asker} meminta masukan sebelum bekerja."))
    elif step.kind == "work" and step.attempt_no > 1:
        previous = await session.scalar(
            select(TaskStep)
            .where(
                TaskStep.task_id == step.task_id,
                TaskStep.agent_id == step.agent_id,
                TaskStep.kind == "work",
                TaskStep.output != "",
                TaskStep.seq < step.seq,
            )
            .order_by(TaskStep.seq.desc())
            .limit(1)
        )
        if previous is not None:
            materials.append(("Hasil Anda sebelumnya yang harus diperbaiki", previous.output))
        if parent is not None and parent.kind == "review":
            materials.append(("Catatan pemeriksaan", parent.output))
    elif parent is not None and parent.output:
        source = await flow.agent_name(session, parent.agent_id)
        materials.append((f"Hasil dari {source}", parent.output))
        if payload == "references":
            await references(parent)

    # Masukan konsultasi yang pernah diterima role ini dalam tugas yang sama
    own = select(TaskStep.id).where(
        TaskStep.task_id == step.task_id, TaskStep.agent_id == step.agent_id
    )
    advice = await session.scalars(
        select(TaskStep)
        .where(
            TaskStep.task_id == step.task_id,
            TaskStep.kind == "consult",
            TaskStep.status == "done",
            TaskStep.parent_step_id.in_(own),
        )
        .order_by(TaskStep.seq)
    )
    for item in advice:
        name = await flow.agent_name(session, item.agent_id)
        materials.append((f"Masukan konsultasi dari {name}", item.output))
    if step.input_notes:
        materials.append(("Catatan yang diperhatikan", step.input_notes))
    return materials


async def _fail_step(sessions: Sessions, task_id, step_id, reason: str, code: str) -> None:
    async with sessions() as session:
        task = await flow.lock_task(session, task_id)
        step = await session.get(TaskStep, step_id)
        if task.status not in OPEN_STATUSES or step.status != "running":
            await session.commit()
            return
        step.status = "failed"
        step.error_code = code
        step.finished_at = utcnow()
        step.queue_no = None
        name = await flow.agent_name(session, step.agent_id)
        message = f"{name} gagal menyelesaikan langkah: {reason}"
        if await routing.outgoing(session, step.agent_id, "rejected"):
            flow.log(session, task, "failed", message, step.id)
            task.pending_routes = [
                *task.pending_routes,
                {"step_id": str(step.id), "trigger": "rejected"},
            ]
            await flow.settle(session, task)
        else:
            await flow.halt(session, task, "failed", message, step.id)
        await session.commit()


async def _store_result(sessions: Sessions, task_id, step_id, result: RunResult) -> None:
    async with sessions() as session:
        task = await flow.lock_task(session, task_id)
        step = await session.get(TaskStep, step_id)
        task.cost_used += result.cost
        step.cost += result.cost
        # Dihentikan manusia atau pengaman selagi model menulis: biaya tetap tercatat
        if task.status not in OPEN_STATUSES or step.status != "running":
            await session.commit()
            return
        step.output = result.output
        step.findings = result.findings
        step.web_sources = result.web_sources
        step.model = result.model
        step.tokens = result.tokens
        step.status = "done"
        step.queue_no = None
        step.finished_at = utcnow()
        for number, hit in enumerate(result.citations, start=1):
            session.add(
                Citation(
                    step_id=step.id,
                    document_id=hit.document_id,
                    version_id=hit.version_id,
                    order_no=number,
                    document_title=hit.document_title,
                    version_no=hit.version_no,
                    page_no=hit.page_no,
                    heading=hit.heading,
                    snippet=hit.snippet[:400],
                    score=hit.score,
                    source_kind=hit.source_kind,
                )
            )
        agent = await session.get(Agent, step.agent_id)
        blocked = {
            "need_info": "butuh data tambahan",
            "not_in_documents": "tidak menemukan aturannya di dokumen",
        }.get(result.status)
        reviewing = step.kind == "review"
        if result.web_sources:
            flow.log(
                session,
                task,
                "step_done",
                f"{agent.name} mencari di internet karena dokumen internal kurang "
                f"({len(result.web_sources)} sumber).",
                step.id,
            )
        if step.kind == "work":
            flow.log(session, task, "step_done", f"{agent.name} menyelesaikan pekerjaan.", step.id)
        elif step.kind == "consult":
            flow.log(session, task, "step_done", f"{agent.name} memberi masukan.", step.id)

        if task.cost_used > task.budget_limit:
            await flow.halt(
                session,
                task,
                "stopped_budget",
                "Biaya mencapai batas tugas. Tugas dihentikan otomatis.",
                step.id,
            )
        elif blocked and step.kind != "consult":
            await flow.request_approval(
                session,
                task,
                step_id=step.id,
                reason="escalate",
                question=f"{agent.name} {blocked}. Lanjutkan dengan hasil ini? Pilih minta revisi "
                "untuk memberi data atau arahan tambahan.",
                requested_from=await flow.owner_of(session, agent.id, task),
                follow_up={"type": "route_after", "step_id": str(step.id)},
            )
        elif reviewing:
            await _apply_review(session, task, step, agent, result.verdict or "revise")
        elif step.kind == "work":
            task.pending_routes = [
                *task.pending_routes,
                {"step_id": str(step.id), "trigger": "complete"},
            ]
        await flow.settle(session, task)
        await session.commit()


async def _apply_review(
    session: AsyncSession, task: Task, step: TaskStep, reviewer: Agent, verdict: str
) -> None:
    step.verdict = verdict
    maker_step = await session.get(TaskStep, step.parent_step_id) if step.parent_step_id else None
    maker = await session.get(Agent, maker_step.agent_id) if maker_step else None
    relation = (
        await session.get(AgentRelation, step.via_relation_id) if step.via_relation_id else None
    )
    if verdict == "approved":
        flow.log(
            session,
            task,
            "review_approved",
            f"{reviewer.name} menerima hasil{f' {maker.name}' if maker else ''}.",
            step.id,
        )
        task.pending_routes = [
            *task.pending_routes,
            {"step_id": str(step.id), "trigger": "complete"},
        ]
        return
    if relation is None or maker is None:
        return
    key = str(relation.id)
    rounds = task.review_rounds.get(key, 0)
    task.review_rounds = {**task.review_rounds, key: rounds + 1}
    maker_step.status = "revise_requested"
    organisation = await budget.read_settings(session, task.organization_id)
    # Batas organisasi mengalahkan batas relasi bila lebih kecil
    limit = min(relation.max_revisions, organisation.max_revisions)
    progress = f"putaran {rounds + 1} dari maks {limit}" if limit else "revisi otomatis dimatikan"
    flow.log(
        session, task, "review_revise", f"{reviewer.name} meminta revisi ({progress}).", step.id
    )
    if rounds + 1 > limit:
        question = (
            f"Batas {limit}× revisi antara {maker.name} dan {reviewer.name} habis. "
            "Terima hasil terakhir?"
            if limit
            else f"{reviewer.name} meminta revisi, tetapi revisi otomatis dimatikan. "
            f"Terima hasil {maker.name}?"
        )
        await flow.request_approval(
            session,
            task,
            step_id=step.id,
            reason="max_revisions",
            question=question,
            requested_from=await flow.owner_of(session, maker.id, task),
            follow_up={
                "type": "route_after",
                "step_id": str(step.id),
                "skip_relation_id": key,
            },
        )
        return
    await flow.add_step(
        session,
        task,
        maker.id,
        "work",
        parent_step_id=step.id,
        attempt_no=maker_step.attempt_no + 1,
        input_notes=f"Catatan {reviewer.name}: perbaiki temuan pemeriksaan.",
    )


async def _work(sessions: Sessions, task: Task, step: TaskStep, providers: Providers) -> None:
    async with sessions() as session:
        locked = await flow.lock_task(session, task.id)
        current = await session.get(TaskStep, step.id)
        if locked.status not in OPEN_STATUSES or current.status != "running":
            await session.commit()
            return
        agent = await session.get(Agent, current.agent_id)
        if agent.deleted_at is not None:
            await session.commit()
            await _fail_step(sessions, task.id, step.id, "role sudah dihapus.", "agent_removed")
            return
        if current.started_at is None:
            current.started_at = utcnow()
            flow.log(
                session,
                locked,
                "step_started",
                f"{agent.name} mulai {KIND_VERB[current.kind]}.",
                current.id,
            )
        current.tries += 1
        locked.status = "running"
        await session.commit()
        tries = current.tries

    try:
        async with sessions() as session:
            current = await session.get(TaskStep, step.id)
            materials = await _materials(session, current)
            entry = current.parent_step_id is None and current.kind == "work"
            images = await _attachments(session, task, current) if current.kind == "work" else []
            result = await run_agent(
                session,
                _caller(task, "step", step.id),
                agent,
                task.brief or task.title,
                task.inputs if agent.id == task.entry_agent_id else {},
                providers.llm,
                providers.embedder,
                materials=[("Judul tugas", task.title), *materials],
                reviewing=current.kind == "review",
                check_inputs=entry,
                attachments=images,
                web_mode=task.web_search,
            )
    except ConflictException:
        async with sessions() as session:
            locked = await flow.lock_task(session, task.id)
            if locked.status in OPEN_STATUSES:
                await flow.halt(
                    session,
                    locked,
                    "stopped_budget",
                    "Anggaran bulanan organisasi habis. Tugas dihentikan.",
                    step.id,
                )
            await session.commit()
        return
    except AppException as exc:
        unavailable = exc.status_code == 503
        if tries < (UNAVAILABLE_TRIES if unavailable else UNREADABLE_TRIES):
            await _requeue(sessions, task.id, step.id)
            raise RetryLater(RETRY_SECONDS * tries if unavailable else 5) from exc
        await _fail_step(sessions, task.id, step.id, exc.message, "model_error")
        return
    except Exception:
        logger.exception("Langkah %s gagal", step.id)
        await _fail_step(
            sessions, task.id, step.id, "terjadi kesalahan pada server.", "internal_error"
        )
        return
    await _store_result(sessions, task.id, step.id, result)


async def _requeue(sessions: Sessions, task_id, step_id) -> None:
    async with sessions() as session:
        task = await flow.lock_task(session, task_id)
        step = await session.get(TaskStep, step_id)
        if task.status in OPEN_STATUSES and step.status == "running":
            step.status = "queued"
        await session.commit()


async def advance(sessions: Sessions, task_id: uuid.UUID, providers: Providers) -> bool:
    """Kerjakan satu hal. True bila masih ada pekerjaan yang bisa langsung dilanjutkan."""
    claimed = await _claim(sessions, task_id)
    if claimed is None:
        return False
    task, step = claimed
    try:
        if step is None:
            await _run_pending_route(sessions, task, providers)
        elif step.consults_expanded or not await _expand_consults(sessions, task, step, providers):
            await _work(sessions, task, step, providers)
    except RetryLater:
        raise
    except AppException as exc:
        # Penilaian kondisi gagal: coba lagi nanti
        if step is not None:
            await _requeue(sessions, task.id, step.id)
        raise RetryLater(RETRY_SECONDS) from exc

    async with sessions() as session:
        current = await session.get(Task, task_id)
        return current.status in ("queued", "running") and await flow.has_work(session, current)
