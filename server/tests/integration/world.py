"""Dua organisasi contoh untuk menguji hak akses dan isolasi."""

from dataclasses import dataclass

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import hash_password
from app.models import Membership, Organization, Unit, User
from app.models.base import utcnow

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
