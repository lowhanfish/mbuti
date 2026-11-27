"""Usulan temuan internet: dikirim anggota, diputuskan admin (kontrak 16.7)."""

import uuid
from urllib.parse import urlparse

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.deps import CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.pengetahuan import service as knowledge
from app.api.v1.endpoints.admin.usulan.schema import (
    ProposalItem,
    ProposalRequest,
    ProposalSummary,
)
from app.core.exceptions import ConflictException, NotFoundException
from app.models import Agent, Document, KnowledgeProposal, Membership, Task, User
from app.models.base import utcnow
from app.services.organisation import lock_organization

NOT_FOUND = "Usulan tidak ditemukan."
DUPLICATE = "Sumber ini sudah diusulkan dan menunggu keputusan admin."
DECIDED = "Usulan ini sudah diputuskan."
STATUSES = ("pending", "approved", "rejected")


async def _items(session: AsyncSession, *filters) -> list[ProposalItem]:
    proposer, decider = aliased(Membership), aliased(Membership)
    proposer_user, decider_user = aliased(User), aliased(User)
    rows = await session.execute(
        select(
            KnowledgeProposal,
            Task.title,
            Agent.name,
            proposer_user.full_name,
            decider_user.full_name,
        )
        .outerjoin(Task, Task.id == KnowledgeProposal.task_id)
        .outerjoin(Agent, Agent.id == KnowledgeProposal.agent_id)
        .outerjoin(proposer, proposer.id == KnowledgeProposal.proposed_by_member_id)
        .outerjoin(proposer_user, proposer_user.id == proposer.user_id)
        .outerjoin(decider, decider.id == KnowledgeProposal.decided_by_member_id)
        .outerjoin(decider_user, decider_user.id == decider.user_id)
        .where(*filters)
        .order_by(KnowledgeProposal.created_at.desc(), KnowledgeProposal.id)
    )
    return [
        ProposalItem(
            id=str(p.id),
            url=p.url,
            title=p.title,
            excerpt=p.excerpt,
            status=p.status,
            task_id=str(p.task_id) if p.task_id else None,
            task_title=task_title,
            agent_name=agent_name,
            proposed_by_name=proposer_name,
            decided_by_name=decider_name,
            decided_at=p.decided_at,
            document_id=str(p.document_id) if p.document_id else None,
            created_at=p.created_at,
        )
        for p, task_title, agent_name, proposer_name, decider_name in rows
    ]


async def read_proposals(
    session: AsyncSession, organization_id: uuid.UUID, status: str
) -> tuple[list[ProposalItem], ProposalSummary]:
    counts = await session.execute(
        select(KnowledgeProposal.status, func.count())
        .where(KnowledgeProposal.organization_id == organization_id)
        .group_by(KnowledgeProposal.status)
    )
    summary = ProposalSummary(**dict(counts.all()))
    filters = [KnowledgeProposal.organization_id == organization_id]
    if status in STATUSES:
        filters.append(KnowledgeProposal.status == status)
    return await _items(session, *filters), summary


async def _owned(session: AsyncSession, model, organization_id: uuid.UUID, value: str | None):
    """ID milik organisasi ini, atau None (diabaikan, bukan galat)."""
    try:
        wanted = uuid.UUID(value or "")
    except ValueError:
        return None
    return await session.scalar(
        select(model.id).where(model.id == wanted, model.organization_id == organization_id)
    )


async def create_proposal(
    session: AsyncSession, actor: CurrentMember, body: ProposalRequest
) -> ProposalItem:
    organization_id = actor.organization_id
    proposal = KnowledgeProposal(
        id=uuid.uuid4(),
        organization_id=organization_id,
        url=body.url,
        title=" ".join(body.title.split()) or urlparse(body.url).netloc or body.url[:200],
        excerpt=body.excerpt.strip(),
        status="pending",
        task_id=await _owned(session, Task, organization_id, body.task_id),
        agent_id=await _owned(session, Agent, organization_id, body.agent_id),
        proposed_by_member_id=actor.membership.id,
    )
    session.add(proposal)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ConflictException(DUPLICATE) from None
    return (await _items(session, KnowledgeProposal.id == proposal.id))[0]


async def _pending(
    session: AsyncSession, organization_id: uuid.UUID, proposal_id: str
) -> KnowledgeProposal:
    proposal = await session.scalar(
        select(KnowledgeProposal).where(
            KnowledgeProposal.id == parse_id(proposal_id, NOT_FOUND),
            KnowledgeProposal.organization_id == organization_id,
        )
    )
    if proposal is None:
        raise NotFoundException(NOT_FOUND)
    if proposal.status != "pending":
        raise ConflictException(DECIDED)
    return proposal


async def approve(session: AsyncSession, actor: CurrentMember, proposal_id: str) -> ProposalItem:
    """Temuan menjadi dokumen organisasi berkategori `web` yang diolah seperti dokumen lain."""
    await lock_organization(session, actor.organization_id)
    proposal = await _pending(session, actor.organization_id, proposal_id)
    host = urlparse(proposal.url).netloc or "internet"
    document = Document(
        id=uuid.uuid4(),
        organization_id=actor.organization_id,
        title=proposal.title[:200],
        description=f"Temuan internet dari {host}."[:1000],
        doc_type="lainnya",
        category="web",
        source_url=proposal.url,
        scope="organization",
        created_by=actor.user.id,
    )
    session.add(document)
    await session.flush()
    body = f"# {proposal.title}\n{proposal.excerpt}\n\nSumber: {proposal.url}\n"
    version_id = await knowledge.add_file_version(
        session, actor, document, f"{host}.md", body.encode()
    )
    proposal.status = "approved"
    proposal.decided_by_member_id = actor.membership.id
    proposal.decided_at = utcnow()
    proposal.document_id = document.id
    await session.commit()
    await knowledge.enqueue_version(session, version_id)
    return (await _items(session, KnowledgeProposal.id == proposal.id))[0]


async def reject(session: AsyncSession, actor: CurrentMember, proposal_id: str) -> ProposalItem:
    proposal = await _pending(session, actor.organization_id, proposal_id)
    proposal.status = "rejected"
    proposal.decided_by_member_id = actor.membership.id
    proposal.decided_at = utcnow()
    await session.commit()
    return (await _items(session, KnowledgeProposal.id == proposal.id))[0]
