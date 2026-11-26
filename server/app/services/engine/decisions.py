"""Akibat keputusan manusia. Dipanggil saat baris tugas sudah dikunci."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentRelation, Approval, Membership, Task, TaskStep
from app.models.base import utcnow
from app.services.engine import flow, routing

VERB = {"approved": "menyetujui", "rejected": "menolak", "revise": "meminta revisi"}


async def _maker_step(session: AsyncSession, step: TaskStep) -> TaskStep:
    """Langkah pembuat hasil: untuk pemeriksaan, langkah yang diperiksa."""
    if step.kind == "review" and step.parent_step_id:
        return await session.get(TaskStep, step.parent_step_id)
    return step


async def _live_relation(
    session: AsyncSession, task: Task, relation_id: str, step: TaskStep | None
) -> AgentRelation | None:
    """Relasi bisa dihapus selagi persetujuannya menunggu; catat bila begitu."""
    relation = await session.get(AgentRelation, uuid.UUID(relation_id))
    if relation is not None and relation.deleted_at is None:
        return relation
    flow.log(
        session,
        task,
        "relation_skipped",
        "Relasi dilewati karena sudah dihapus.",
        step.id if step else None,
    )
    return None


async def decide(
    session: AsyncSession,
    task: Task,
    approval: Approval,
    decision: str,
    comment: str,
    member: Membership,
) -> None:
    approval.status = decision
    approval.comment = comment
    approval.decided_by_member_id = member.id
    approval.decided_at = utcnow()
    who = await flow.member_name(session, member.id)
    quoted = f': "{comment}"' if comment else "."
    flow.log(session, task, "approval_decided", f"{who} {VERB[decision]}{quoted}", approval.step_id)
    await session.flush()

    follow = approval.follow_up or {}
    kind = follow.get("type")
    step = await session.get(TaskStep, approval.step_id) if approval.step_id else None

    if decision == "rejected":
        maker = await _maker_step(session, step) if step else None
        if (
            maker is not None
            and kind != "run_consult"
            and not follow.get("from_rejection")
            and await routing.outgoing(session, maker.agent_id, "rejected")
        ):
            task.pending_routes = [
                *task.pending_routes,
                {"step_id": str(maker.id), "trigger": "rejected"},
            ]
        else:
            await flow.halt(
                session,
                task,
                "failed",
                "Tugas ditolak dan dihentikan.",
                comment="Tugas ditolak pada persetujuan lain.",
            )
            return
    elif kind == "run_consult":
        # "Minta revisi" pada izin konsultasi: kerjakan tanpa konsultasi itu, dengan catatan
        held = step
        if decision == "approved":
            relation = await _live_relation(session, task, follow["relation_id"], held)
            if relation is not None and await routing.active_target(session, task, relation, held):
                await flow.add_step(
                    session,
                    task,
                    relation.target_agent_id,
                    "consult",
                    via_relation_id=relation.id,
                    parent_step_id=held.id,
                    input_notes=relation.expected_output,
                    queue_no=follow["consult_queue_no"],
                )
        else:
            held.input_notes = " ".join(
                part for part in (held.input_notes, f"Catatan {who}: {comment}") if part
            )
        still_waiting = any(
            a.follow_up.get("type") == "run_consult" and a.follow_up.get("step_id") == str(held.id)
            for a in await flow.pending_approvals(session, task)
        )
        if not still_waiting and held.status == "queued":
            held.queue_no = follow["queue_no"]
    elif decision == "revise" and step is not None:
        maker = await _maker_step(session, step)
        await flow.add_step(
            session,
            task,
            maker.agent_id,
            "work",
            parent_step_id=step.id,
            attempt_no=maker.attempt_no + 1,
            input_notes=f"Catatan {who}: {comment or 'perbaiki hasil.'}",
        )
    elif decision == "approved":
        if kind == "run_relation":
            source = await session.get(TaskStep, uuid.UUID(follow["step_id"]))
            relation = await _live_relation(session, task, follow["relation_id"], source)
            if relation is not None and source is not None:
                await routing.run_relation(session, task, relation, source)
        elif kind == "route_after":
            job = {"step_id": follow["step_id"], "trigger": "complete"}
            if follow.get("skip_relation_id"):
                job["skip_relation_id"] = follow["skip_relation_id"]
            task.pending_routes = [*task.pending_routes, job]
    # Tugas yang tadinya menunggu berjalan lagi bila ada pekerjaan
    if task.status == "waiting_approval":
        task.status = "running"
    await flow.settle(session, task)
