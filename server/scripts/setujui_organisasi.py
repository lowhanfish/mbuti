"""
Setujui, tangguhkan, atau lihat organisasi yang mendaftar sendiri.

Jalankan dari `server/` dengan venv aktif:

    python -m scripts.setujui_organisasi --daftar         # yang menunggu persetujuan
    python -m scripts.setujui_organisasi <slug>           # setujui; pemilik diberi tahu
    python -m scripts.setujui_organisasi <slug> --tangguhkan

Email pemberitahuan dimasukkan ke antrean, jadi Redis harus menyala dan worker yang mengirimnya.
"""

import argparse
import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import engine, session_factory
from app.models import Membership, Organization, User
from app.services import mailer


class ApprovalError(Exception):
    pass


async def pending_organizations(session: AsyncSession) -> list[tuple[Organization, str]]:
    """Organisasi yang menunggu, beserta email pemiliknya, terlama dulu."""
    rows = await session.execute(
        select(Organization, User.email)
        .join(Membership, Membership.organization_id == Organization.id)
        .join(User, User.id == Membership.user_id)
        .where(Organization.status == "pending", Membership.access_role == "owner")
        .order_by(Organization.created_at)
    )
    return [(organization, email) for organization, email in rows.all()]


async def set_status(session: AsyncSession, slug: str, status: str) -> Organization:
    """Ubah status; menyetujui organisasi mengirim email ke pemilik yang sudah terverifikasi."""
    organization = await session.scalar(
        select(Organization).where(Organization.slug == slug.strip()).with_for_update()
    )
    if organization is None:
        raise ApprovalError(f"Organisasi dengan slug '{slug}' tidak ditemukan.")
    if organization.status == status:
        raise ApprovalError(f"Organisasi '{organization.name}' sudah berstatus {status}.")
    was_pending = organization.status == "pending"
    organization.status = status
    await session.commit()

    if status == "active" and was_pending:
        owners = await session.scalars(
            select(User)
            .join(Membership, Membership.user_id == User.id)
            .where(
                Membership.organization_id == organization.id,
                Membership.access_role == "owner",
                Membership.status == "active",
                User.is_verified.is_(True),
            )
        )
        for owner in owners:
            mailer.queue(
                mailer.organization_approved(owner.email, owner.full_name, organization.name)
            )
    return organization


def parse_options(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Setujui organisasi yang mendaftar sendiri.")
    parser.add_argument("slug", nargs="?", help="slug organisasi")
    parser.add_argument("--daftar", action="store_true", help="tampilkan yang menunggu")
    parser.add_argument("--tangguhkan", action="store_true", help="tangguhkan, bukan setujui")
    return parser.parse_args(argv)


async def main(options: argparse.Namespace) -> int:
    try:
        async with session_factory() as session:
            if options.daftar or not options.slug:
                waiting = await pending_organizations(session)
                if not waiting:
                    print("Tidak ada organisasi yang menunggu persetujuan.")
                for organization, email in waiting:
                    print(
                        f"{organization.slug}\t{organization.name}\t{email}\t"
                        f"{organization.created_at:%Y-%m-%d %H:%M}"
                    )
                return 0
            status = "suspended" if options.tangguhkan else "active"
            organization = await set_status(session, options.slug, status)
    except ApprovalError as exc:
        print(f"Gagal: {exc}")
        return 1
    finally:
        await engine.dispose()

    verb = "ditangguhkan" if status == "suspended" else "disetujui"
    print(f"Organisasi '{organization.name}' {verb}.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(parse_options())))
