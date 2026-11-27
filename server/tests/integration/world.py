"""Dua organisasi contoh untuk menguji hak akses dan isolasi."""

from dataclasses import dataclass

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import hash_password
from app.models import Agent, Membership, Organization, Unit, User
from app.models.base import utcnow
from app.services.appearance import avatar_from_seed
from app.services.formation.versions import record_manual_version

PASSWORD = "kata-sandi-uji-123"
PASSWORD_HASH = hash_password(PASSWORD)

PEOPLE = {
    "a_owner": ("a", "owner"),
    "a_admin": ("a", "admin"),
    "a_member": ("a", "member"),
    "a_viewer": ("a", "viewer"),
    "b_owner": ("b", "owner"),
    "b_member": ("b", "member"),
}


@dataclass
class World:
    sessions: async_sessionmaker[AsyncSession]
    organizations: dict[str, Organization]
    users: dict[str, User]
    members: dict[str, Membership]
    units: dict[str, Unit]

    def email(self, name: str) -> str:
        return self.users[name].email

    def member_id(self, name: str) -> str:
        return str(self.members[name].id)

    def unit_id(self, name: str) -> str:
        return str(self.units[name].id)


def new_client(application: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=application), base_url="http://localhost:8000")


async def build_world(sessions: async_sessionmaker[AsyncSession]) -> World:
    """Organisasi `a` dan `b`; masing-masing satu unit bernama sama untuk menguji pemisahan."""
    organizations = {
        key: Organization(name=f"Organisasi {key.upper()}", slug=f"org-uji-{key}")
        for key in ("a", "b")
    }
    users = {
        name: User(
            email=f"{name}@uji.test",
            full_name=name.replace("_", " ").title(),
            password_hash=PASSWORD_HASH,
            is_verified=True,
        )
        for name in PEOPLE
    }
    async with sessions() as session:
        session.add_all([*organizations.values(), *users.values()])
        await session.flush()
        units = {
            key: Unit(organization_id=org.id, name="Sekretariat", code="SEK")
            for key, org in organizations.items()
        }
        session.add_all(units.values())
        await session.flush()
        members = {
            name: Membership(
                organization_id=organizations[org].id,
                user_id=users[name].id,
                access_role=role,
                status="active",
                joined_at=utcnow(),
            )
            for name, (org, role) in PEOPLE.items()
        }
        session.add_all(members.values())
        await session.commit()
    return World(sessions, organizations, users, members, units)


async def add_agents(world: World, organization: str, *names: str) -> list[str]:
    """Role aktif langsung ke database, agar tes relasi tidak lambat. Mengembalikan ID-nya."""
    agents = [
        Agent(
            organization_id=world.organizations[organization].id,
            name=name,
            title=f"Jabatan {name}",
            goal="Tujuan kerja untuk pengujian.",
            status="active",
            avatar=avatar_from_seed(name),
        )
        for name in names
    ]
    async with world.sessions() as session:
        session.add_all(agents)
        await session.flush()
        # Seperti migrasi E1a: role yang sudah ada punya versi 1 isian manual yang Final
        for agent in agents:
            await record_manual_version(session, agent, None, None, "Versi uji.")
        await session.commit()
    return [str(agent.id) for agent in agents]
