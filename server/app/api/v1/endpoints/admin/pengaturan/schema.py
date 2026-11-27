"""Sama dengan `pengaturan/*/types.ts` (kontrak bagian 11)."""

import datetime

from pydantic import BaseModel, Field, model_validator

from app.api.v1.common import RequestModel


class ModelOption(BaseModel):
    id: str
    label: str
    hint: str
    estimated_step_cost: int


class ModelProfile(BaseModel):
    slot: str
    model: str
    env_name: str
    agent_count: int


class ApiKeyInfo(BaseModel):
    env_name: str
    status: str
    requests_today: int
    last_used_at: datetime.datetime | None
    cooldown_until: datetime.datetime | None


class UsageToday(BaseModel):
    purpose: str
    calls: int
    # Rupiah
    cost: int


class EmbeddingInfo(BaseModel):
    model: str
    dimension: int


class ModelSettings(BaseModel):
    provider: str = "gemini"
    profiles: list[ModelProfile]
    available_models: list[ModelOption]
    api_keys: list[ApiKeyInfo]
    embedding: EmbeddingInfo
    usage_today: list["UsageToday"]
    updated_at: datetime.datetime


class Models(RequestModel):
    fast: str
    balanced: str
    thorough: str
    fallback: str


class ModelUpdate(RequestModel):
    models: Models


def rupiah(value: int) -> str:
    return "Rp" + f"{value:,}".replace(",", ".")


class BudgetUpdate(RequestModel):
    monthly_budget: int = Field(strict=True)
    default_task_budget: int = Field(strict=True)
    max_steps_per_task: int = Field(strict=True)
    max_revisions: int = Field(strict=True)

    @model_validator(mode="after")
    def check_ranges(self) -> "BudgetUpdate":
        money = (
            ("Batas bulanan", self.monthly_budget, 1_000, 100_000_000),
            ("Batas bawaan per tugas", self.default_task_budget, 500, 1_000_000),
        )
        for label, value, low, high in money:
            if not low <= value <= high:
                raise ValueError(f"{label} antara {rupiah(low)} dan {rupiah(high)}.")
        if self.default_task_budget > self.monthly_budget:
            raise ValueError("Batas bawaan per tugas tidak boleh melebihi batas bulanan.")
        if not 1 <= self.max_steps_per_task <= 50:
            raise ValueError("Batas langkah antara 1 dan 50.")
        if not 0 <= self.max_revisions <= 5:
            raise ValueError("Batas revisi antara 0 dan 5.")
        return self


class Usage(BaseModel):
    month: str
    used: int
    trial_cost: int
    remaining: int
    task_count: int


class BudgetSettings(BaseModel):
    monthly_budget: int
    default_task_budget: int
    max_steps_per_task: int
    max_revisions: int
    usage: Usage
    updated_at: datetime.datetime
