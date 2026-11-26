"""Health check dengan PostgreSQL dan Redis sungguhan."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


async def test_health_reports_all_services_up(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert (data["database"], data["pgvector"], data["redis"]) == ("up", "up", "up")
