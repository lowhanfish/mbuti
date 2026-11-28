"""Membuat tugas beserta langkah pertamanya, dari formulir maupun tugas rutin."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Agent, Task
from app.services.engine import flow


async def open_task(session: AsyncSession, agent: Agent, message: str, **values) -> Task:
    """Pemanggil sudah memeriksa isian, menyimpan transaksi, lalu mengantrekan tugasnya."""
    task = Task(id=uuid.uuid4(), entry_agent_id=agent.id, status="queued", **values)
    session.add(task)
    await session.flush()
    flow.log(session, task, "created", message)
    await session.flush()
    await flow.add_step(session, task, agent.id, "work")
    return task
