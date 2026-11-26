"""Bentuk respons health check."""

from typing import Literal

from pydantic import BaseModel

ServiceStatus = Literal["up", "down"]


class HealthData(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    database: ServiceStatus
    pgvector: ServiceStatus
    redis: ServiceStatus


class HealthResponse(BaseModel):
    success: bool
    statusCode: int
    message: str
    data: HealthData
