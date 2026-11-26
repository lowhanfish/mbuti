"""
Buat akun pemilik pertama beserta organisasinya.

Jalankan dari `server/` dengan venv aktif:

    python -m scripts.create_account

Kata sandi diketik tersembunyi dan tidak pernah dicetak.
"""

import asyncio
import getpass
import re
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.common import EMAIL_PATTERN
from app.core.security import PASSWORD_MIN_LENGTH, hash_password
from app.db.session import engine, session_factory
from app.models import Membership, Organization, User
from app.models.base import utcnow


class AccountError(Exception):
    pass


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:150] or "organisasi"


async def create_owner(
    session: AsyncSession, organization_name: str, email: str, full_name: str, password: str
) -> tuple[Organization, bool]:
    """Tambahkan pemilik; organisasi dengan slug yang sama dipakai ulang. True bila baru."""
    organization_name, full_name = organization_name.strip(), full_name.strip()
    email = email.strip().lower()
    if len(organization_name) < 3:
        raise AccountError("Nama organisasi minimal 3 karakter.")
    if len(full_name) < 2:
        raise AccountError("Nama minimal 2 karakter.")
    if not EMAIL_PATTERN.match(email):
        raise AccountError("Format email tidak valid.")
    if len(password) < PASSWORD_MIN_LENGTH:
        raise AccountError(f"Kata sandi minimal {PASSWORD_MIN_LENGTH} karakter.")
    if await session.scalar(select(User.id).where(User.email == email)):
        raise AccountError("Email ini sudah terdaftar.")

    slug = slugify(organization_name)
    organization = await session.scalar(select(Organization).where(Organization.slug == slug))
    created = organization is None
    if created:
        organization = Organization(name=organization_name, slug=slug)
        session.add(organization)

    user = User(
        email=email, full_name=full_name, password_hash=hash_password(password), is_verified=True
    )
    session.add(user)
    await session.flush()
    session.add(
        Membership(
            organization_id=organization.id,
            user_id=user.id,
            access_role="owner",
            status="active",
            joined_at=utcnow(),
        )
    )
    await session.commit()
    return organization, created


def ask_password() -> str:
    if not sys.stdin.isatty():
        raise AccountError("Jalankan di terminal agar kata sandi bisa diketik tersembunyi.")
    password = getpass.getpass(f"Kata sandi (minimal {PASSWORD_MIN_LENGTH} karakter): ")
    if password != getpass.getpass("Ulangi kata sandi: "):
        raise AccountError("Kedua kata sandi tidak sama.")
    return password


async def main() -> int:
    try:
        organization_name = input("Nama organisasi: ")
        full_name = input("Nama lengkap pemilik: ")
        email = input("Email: ")
        password = ask_password()
        async with session_factory() as session:
            organization, created = await create_owner(
                session, organization_name, email, full_name, password
            )
    except AccountError as exc:
        print(f"Gagal: {exc}")
        return 1
    except (KeyboardInterrupt, EOFError):
        print("\nDibatalkan.")
        return 1
    finally:
        await engine.dispose()

    verb = "dibuat" if created else "sudah ada; pemilik ditambahkan"
    print(f"Organisasi '{organization.name}' {verb}. Silakan masuk dengan email tersebut.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
