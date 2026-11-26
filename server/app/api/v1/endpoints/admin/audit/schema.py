"""Sama dengan `pengaturan/jejak-audit/types.ts` (kontrak bagian 14)."""

import datetime

from pydantic import BaseModel


class AuditItem(BaseModel):
    id: str
    action: str
    label: str
    target: str
    actor_name: str
    actor_email: str
    ip: str
    request_id: str
    created_at: datetime.datetime
