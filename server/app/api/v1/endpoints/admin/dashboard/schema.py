"""Sama dengan `dashboard/types.ts` (kontrak bagian 10)."""

import datetime

from pydantic import BaseModel

from app.api.v1.endpoints.admin.role.schema import RoleSummary
from app.api.v1.endpoints.admin.tugas.schema import TaskSummary
from app.services.engine.views import AgentRef


class Budget(BaseModel):
    month: str
    used: int
    trial_cost: int
    remaining: int
    task_count: int
    limit: int


class DailyCost(BaseModel):
    date: datetime.date
    cost: int


class BusyAgent(BaseModel):
    agent: AgentRef
    step_count: int
    cost: int


class Summary(BaseModel):
    tasks: TaskSummary
    agents: RoleSummary
    pending_approval_count: int
    budget: Budget
    daily_costs: list[DailyCost]
    busiest_agents: list[BusyAgent]
