"""
Matikan verifikasi dua langkah satu akun, bila ponsel dan kode cadangannya hilang.

Pastikan dulu orang yang meminta benar pemilik akunnya, lalu jalankan dari `server/`:

    python -m scripts.matikan_dua_langkah nama@instansi.go.id
"""

import argparse
import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth.service import membership_of, revoke_user_sessions
from app.db.session import engine, session_factory
from app.models import User
from app.services import audit, two_factor


class NotPossible(Exception):
    pass


async def disable(session: AsyncSession, email: str) -> None:
    email = email.strip().lower()
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        raise NotPossible("Akun tidak ditemukan.")
    row = await two_factor.find(session, user.id, lock=True)
    if row is None or row.enabled_at is None:
        raise NotPossible("Akun ini tidak memakai verifikasi dua langkah.")
    await session.delete(row)
    await revoke_user_sessions(session, user.id, "two_factor")
    membership = await membership_of(session, user.id)
    audit.add_entry(
        session,
        action="auth.dua_langkah_mati",
        organization_id=membership.organization_id if membership else None,
        user=user,
        target="oleh pengelola platform",
    )
    await session.commit()


async def run(email: str) -> int:
    try:
        async with session_factory() as session:
            await disable(session, email)
    except NotPossible as exc:
        print(exc, file=sys.stderr)
        return 1
    finally:
        await engine.dispose()
    print("Verifikasi dua langkah dimatikan dan semua sesi akun itu dicabut.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email")
    return asyncio.run(run(parser.parse_args().email))


if __name__ == "__main__":
    sys.exit(main())
