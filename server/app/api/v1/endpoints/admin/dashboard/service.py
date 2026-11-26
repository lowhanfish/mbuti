import datetime
from dataclasses import asdict
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember
from app.api.v1.endpoints.admin.dashboard.schema import Budget, BusyAgent, DailyCost, Summary
from app.api.v1.endpoints.admin.persetujuan.service import count_pending
from app.api.v1.endpoints.admin.role.schema import RoleSummary
from app.api.v1.endpoints.admin.role.service import live_agents
from app.api.v1.endpoints.admin.tugas.schema import TaskSummary
from app.models import Agent, LlmCall, Organization, Task, TaskStep
from app.models.base import utcnow
from app.services import budget
from app.services.engine.views import agent_refs

DAYS = 7
BUSIEST = 5


async def read_summary(session: AsyncSession, member: CurrentMember) -> Summary:
    organization_id = member.organization_id
    organization = await session.get(Organization, organization_id)
    zone = ZoneInfo(organization.timezone)
    today = utcnow().astimezone(zone).date()
    month_start = datetime.datetime.combine(today.replace(day=1), datetime.time(), zone)

    tasks = await session.execute(
        select(Task.status, func.count())
        .where(Task.organization_id == organization_id)
        .group_by(Task.status)
    )
    agents = await session.execute(
        select(Agent.status, func.count())
        .where(*live_agents(organization_id))
        .group_by(Agent.status)
    )

    first = today - datetime.timedelta(days=DAYS - 1)
    local_day = cast(func.timezone(organization.timezone, LlmCall.created_at), Date)
    costs = dict(
        (
            await session.execute(
                select(local_day.label("day"), func.sum(LlmCall.cost))
                .where(
                    LlmCall.organization_id == organization_id,
                    LlmCall.created_at >= datetime.datetime.combine(first, datetime.time(), zone),
                )
                .group_by("day")
            )
        ).all()
    )
    busiest = (
        await session.execute(
            select(
                TaskStep.agent_id,
                func.count().label("steps"),
                func.coalesce(func.sum(TaskStep.cost), 0).label("cost"),
            )
            .join(Task, Task.id == TaskStep.task_id)
            .join(Agent, Agent.id == TaskStep.agent_id)
            .where(
                Task.organization_id == organization_id,
                Agent.deleted_at.is_(None),
                TaskStep.finished_at >= month_start,
                TaskStep.status.in_(("done", "revise_requested")),
            )
            .group_by(TaskStep.agent_id)
            .order_by(func.count().desc(), func.sum(TaskStep.cost).desc())
            .limit(BUSIEST)
        )
    ).all()
    refs = await agent_refs(session, [row.agent_id for row in busiest])
    usage = await budget.month_usage(session, organization_id)
    limit = (await budget.read_settings(session, organization_id)).monthly_budget
    return Summary(
        tasks=TaskSummary(**dict(tasks.all())),
        agents=RoleSummary(**dict(agents.all())),
        pending_approval_count=await count_pending(session, member),
        budget=Budget(**asdict(usage), limit=limit),
        daily_costs=[
            DailyCost(date=day, cost=costs.get(day, 0))
            for day in (first + datetime.timedelta(days=n) for n in range(DAYS))
        ],
        busiest_agents=[
            BusyAgent(agent=refs[row.agent_id], step_count=row.steps, cost=row.cost)
            for row in busiest
        ],
    )
