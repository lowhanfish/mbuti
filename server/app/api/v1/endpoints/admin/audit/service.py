import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.common import Paging, like_pattern
from app.api.v1.endpoints.admin.audit.schema import AuditItem
from app.models import AuditLog
from app.services.audit import label_for


async def read_logs(
    session: AsyncSession, organization_id: uuid.UUID, search: str, group: str, page: Paging
) -> tuple[int, list[AuditItem]]:
    filters = [AuditLog.organization_id == organization_id]
    if search.strip():
        pattern = like_pattern(search.strip())
        filters.append(
            or_(
                AuditLog.target.ilike(pattern, escape="\\"),
                AuditLog.actor_name.ilike(pattern, escape="\\"),
                AuditLog.actor_email.ilike(pattern, escape="\\"),
            )
        )
    if group:
        # Kelompok tindakan, mis. "role" untuk role.buat dan role.hapus
        filters.append(AuditLog.action.startswith(f"{group}.", autoescape=True))
    total = await session.scalar(select(func.count()).select_from(AuditLog).where(*filters))
    rows = await session.scalars(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.seq.desc())
        .offset(page.skip)
        .limit(page.limit)
    )
    return total, [
        AuditItem(
            id=str(row.id),
            action=row.action,
            label=label_for(row.action),
            target=row.target,
            actor_name=row.actor_name,
            actor_email=row.actor_email,
            ip=row.ip,
            request_id=row.request_id,
            created_at=row.created_at,
        )
        for row in rows
    ]
