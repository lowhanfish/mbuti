"""
Tambahkan data contoh (dua role, relasi, dan satu SOP karangan) ke organisasi seorang pemilik.

    python -m scripts.data_contoh --email nama@instansi.go.id

Nyalakan worker agar dokumennya diolah. Setelah itu buat tugas untuk Rani.
"""

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.api.deps import CurrentMember
from app.core.exceptions import AppException
from app.db.session import engine, session_factory
from app.models import Membership, User
from app.services.sample import SampleExists, seed


async def run(email: str) -> int:
    try:
        async with session_factory() as session:
            row = (
                await session.execute(
                    select(User, Membership)
                    .join(Membership, Membership.user_id == User.id)
                    .where(
                        User.email == email.strip().lower(),
                        Membership.status == "active",
                        Membership.access_role.in_(("owner", "admin")),
                    )
                    .limit(1)
                )
            ).first()
        if row is None:
            print("Gagal: tidak ada pemilik atau admin aktif dengan email itu.")
            return 1
        await seed(session_factory, CurrentMember(user=row.User, membership=row.Membership))
    except (SampleExists, AppException) as exc:
        print(f"Gagal: {getattr(exc, 'message', exc)}")
        return 1
    finally:
        await engine.dispose()
    print(
        "Data contoh ditambahkan. Dokumen diolah oleh worker; setelah siap, buat tugas untuk Rani."
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Tambahkan data contoh.")
    parser.add_argument("--email", required=True, help="email pemilik atau admin organisasi")
    return asyncio.run(run(parser.parse_args(argv).email))


if __name__ == "__main__":
    sys.exit(main())
