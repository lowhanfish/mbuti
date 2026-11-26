"""Bagian worker eksekusi yang menyentuh database: pemulihan dan menyerah."""

import datetime
import uuid

from sqlalchemy import update

from app.models import Task
from app.models.base import utcnow
from app.workers.execution import GAVE_UP, _give_up, _stalled
from tests.integration.tasks import create_task, detail, events
from tests.integration.world import add_agents


async def test_stalled_tasks_and_giving_up(world, sign_in, database):
    client = await sign_in("a_owner")
    (rani,) = await add_agents(world, "a", "Rani")
    idle = await create_task(client, rani)
    fresh = await create_task(client, rani)
    async with world.sessions() as session:
        await session.execute(
            update(Task)
            .where(Task.id == uuid.UUID(idle))
            .values(updated_at=utcnow() - datetime.timedelta(minutes=6))
        )
        await session.commit()

    assert await _stalled(database) == [idle]

    await _give_up(database, uuid.UUID(fresh))
    task = await detail(client, fresh)
    assert task["status"] == "failed" and events(task, "failed") == [GAVE_UP]
