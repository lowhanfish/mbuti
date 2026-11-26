"""Akun mandiri (kontrak API bagian 15): daftar, verifikasi, lupa kata sandi, dan undangan."""

import datetime
from urllib.parse import parse_qs, urlparse

from sqlalchemy import func, select, update

from app.core.config import settings
from app.models import AuditLog, AuthToken, Membership, Organization, User
from app.models.base import utcnow
from scripts.setujui_organisasi import pending_organizations, set_status
from tests.integration.world import PASSWORD, new_client

AUTH = "/api/v1/auth"
PROFILE = "/api/v1/admin/organisasi/profil"
NEW_PASSWORD = "sandi baru yang panjang"
REGISTRATION = {
    "full_name": "Ani Pendaftar",
    "email": "  Ani@Sekolah-Uji.test ",
    "password": "sandi-pendaftar-2026",
    "organization_name": "SMA Uji Harapan",
    "sector": "pendidikan",
    "accept_terms": True,
}


def token_from(email: dict) -> str:
    return parse_qs(urlparse(email["link"]).query)["token"][0]


def last_email(sent: list[dict], to: str) -> dict:
    return next(e for e in reversed(sent) if e["to"] == to)


async def test_register_verify_and_wait_for_approval(application, world, sent_emails):
    async with new_client(application) as client:
        options = await client.get(f"{AUTH}/options")
        assert options.json()["data"] == {"registration": "approval", "password_min_length": 10}

        registered = await client.post(f"{AUTH}/register", json=REGISTRATION)
        assert registered.status_code == 201, registered.text
        assert registered.json()["message"].startswith("Pendaftaran diterima")

        email = last_email(sent_emails, "ani@sekolah-uji.test")
        assert email["subject"] == "Verifikasi email akun MBUTI"
        assert email["link"].startswith(f"{settings.APP_URL}/verifikasi?token=")

        # Belum diverifikasi: kata sandi benar tetap ditolak dengan kode khusus
        login = await client.post(
            f"{AUTH}/login",
            json={"email": "ani@sekolah-uji.test", "password": "sandi-pendaftar-2026"},
        )
        assert login.status_code == 403
        assert login.json()["code"] == "email_not_verified"

        verified = await client.post(f"{AUTH}/verify-email", json={"token": token_from(email)})
        assert verified.status_code == 200, verified.text
        user = verified.json()["data"]["user"]
        assert user["is_verified"] is True and user["access_role"] == "owner"
        assert user["organization"]["status"] == "pending"
        assert user["organization"]["slug"] == "sma-uji-harapan"
        client.headers["X-CSRF-Token"] = client.cookies["csrf_token"]

        # Sesi ada, tetapi fitur aplikasi tertutup sampai disetujui
        assert (await client.get(f"{AUTH}/me")).status_code == 200
        blocked = await client.get(PROFILE)
        assert blocked.status_code == 403 and blocked.json()["code"] == "organization_pending"

        again = await client.post(f"{AUTH}/verify-email", json={"token": token_from(email)})
        assert again.status_code == 400 and again.json()["code"] == "invalid_token"

        async with world.sessions() as session:
            waiting = await pending_organizations(session)
            assert [o.slug for o, _ in waiting] == ["sma-uji-harapan"]
            await set_status(session, "sma-uji-harapan", "active")
        assert last_email(sent_emails, "ani@sekolah-uji.test")["subject"].startswith(
            "SMA Uji Harapan sudah bisa"
        )
        assert (await client.get(PROFILE)).status_code == 200

    async with world.sessions() as session:
        stored = await session.scalar(select(User).where(User.email == "ani@sekolah-uji.test"))
        assert stored.terms_accepted_at is not None
        actions = set(
            (
                await session.scalars(select(AuditLog.action).where(AuditLog.user_id == stored.id))
            ).all()
        )
        assert {"auth.daftar", "auth.verifikasi"} <= actions
        # Hanya hash token yang tersimpan
        hashes = (await session.scalars(select(AuthToken.token_hash))).all()
        assert token_from(email) not in hashes and all(len(h) == 64 for h in hashes)


async def test_register_hides_existing_email_and_validates(
    application, world, sent_emails, monkeypatch
):
    async with new_client(application) as client:
        taken = await client.post(
            f"{AUTH}/register", json={**REGISTRATION, "email": "a_owner@uji.test"}
        )
        assert taken.status_code == 201
        assert taken.json()["message"].startswith("Pendaftaran diterima")
        assert last_email(sent_emails, "a_owner@uji.test")["subject"] == (
            "Anda sudah punya akun MBUTI"
        )

        short = await client.post(f"{AUTH}/register", json={**REGISTRATION, "password": "pendek"})
        assert short.status_code == 422
        assert short.json()["message"] == "Kata sandi minimal 10 karakter."
        terms = await client.post(f"{AUTH}/register", json={**REGISTRATION, "accept_terms": False})
        assert terms.status_code == 422 and "ketentuan layanan" in terms.json()["message"]

        monkeypatch.setattr(settings, "REGISTRATION_MODE", "closed")
        closed = await client.post(f"{AUTH}/register", json=REGISTRATION)
        assert closed.status_code == 403

    async with world.sessions() as session:
        # Hanya dua organisasi dunia uji; pendaftaran dengan email lama tidak membuat apa pun
        assert await session.scalar(select(func.count()).select_from(Organization)) == 2


async def test_open_mode_activates_and_slug_stays_unique(
    application, world, sent_emails, monkeypatch
):
    monkeypatch.setattr(settings, "REGISTRATION_MODE", "open")
    async with new_client(application) as client:
        for email in ("satu@uji-daftar.test", "dua@uji-daftar.test"):
            response = await client.post(
                f"{AUTH}/register",
                json={**REGISTRATION, "email": email, "organization_name": "Organisasi A"},
            )
            assert response.status_code == 201

    async with world.sessions() as session:
        rows = (
            await session.execute(
                select(Organization.slug, Organization.status).where(
                    Organization.slug.like("organisasi-a%")
                )
            )
        ).all()
    # Nama sama boleh; slug kedua diberi nomor
    assert sorted(rows) == [("organisasi-a", "active"), ("organisasi-a-2", "active")]


async def test_forgot_and_reset_password(application, world, sign_in, sent_emails):
    old_session = await sign_in("a_member")
    async with new_client(application) as client:
        unknown = await client.post(f"{AUTH}/forgot-password", json={"email": "tidak@ada.test"})
        known = await client.post(f"{AUTH}/forgot-password", json={"email": " A_Member@uji.test"})
        assert unknown.status_code == known.status_code == 200
        assert unknown.json()["message"] == known.json()["message"]
        assert [e["to"] for e in sent_emails] == ["a_member@uji.test"]
        token = token_from(sent_emails[0])

        weak = await client.post(
            f"{AUTH}/reset-password", json={"token": token, "password": "pendek"}
        )
        assert weak.status_code == 422

        reset = await client.post(
            f"{AUTH}/reset-password", json={"token": token, "password": NEW_PASSWORD}
        )
        assert reset.status_code == 200, reset.text
        assert last_email(sent_emails, "a_member@uji.test")["subject"] == (
            "Kata sandi MBUTI Anda diubah"
        )

        reused = await client.post(
            f"{AUTH}/reset-password", json={"token": token, "password": NEW_PASSWORD}
        )
        assert reused.status_code == 400 and reused.json()["code"] == "invalid_token"

        # Sesi lama dicabut; kata sandi lama tidak berlaku, yang baru (dengan spasi) berlaku
        assert (await old_session.get(f"{AUTH}/me")).status_code == 401
        old = await client.post(
            f"{AUTH}/login", json={"email": "a_member@uji.test", "password": PASSWORD}
        )
        assert old.status_code == 401
        new = await client.post(
            f"{AUTH}/login", json={"email": "a_member@uji.test", "password": NEW_PASSWORD}
        )
        assert new.status_code == 200

        # Tautan kedaluwarsa
        await client.post(f"{AUTH}/forgot-password", json={"email": "a_member@uji.test"})
        expired = token_from(sent_emails[-1])
        async with world.sessions() as session:
            await session.execute(
                update(AuthToken)
                .where(AuthToken.used_at.is_(None))
                .values(expires_at=utcnow() - datetime.timedelta(minutes=1))
            )
            await session.commit()
        late = await client.post(
            f"{AUTH}/reset-password", json={"token": expired, "password": NEW_PASSWORD}
        )
        assert late.status_code == 400


async def test_email_requests_are_rate_limited(application, world, sent_emails):
    async with new_client(application) as client:
        answers = [
            (await client.post(f"{AUTH}/forgot-password", json={"email": "a_owner@uji.test"}))
            for _ in range(4)
        ]
    assert [a.status_code for a in answers] == [200, 200, 200, 429]
    assert len(sent_emails) == 3


async def test_invite_resend_and_accept(application, world, sign_in, sent_emails):
    owner = await sign_in("a_owner")
    invited = await owner.post(
        "/api/v1/admin/pengguna/invite",
        json={"full_name": "Budi Diundang", "email": "budi@uji.test", "access_role": "member"},
    )
    assert invited.status_code == 201, invited.text
    assert invited.json()["message"] == "Undangan terkirim."
    member_id = invited.json()["data"]["id"]
    first = token_from(last_email(sent_emails, "budi@uji.test"))

    member = await sign_in("a_member")
    forbidden = await member.post(f"/api/v1/admin/pengguna/resend-invite/{member_id}")
    assert forbidden.status_code == 403
    other = await sign_in("b_owner")
    hidden = await other.post(f"/api/v1/admin/pengguna/resend-invite/{member_id}")
    assert hidden.status_code == 404

    resent = await owner.post(f"/api/v1/admin/pengguna/resend-invite/{member_id}")
    assert resent.status_code == 200, resent.text
    second = token_from(last_email(sent_emails, "budi@uji.test"))
    assert second != first

    async with new_client(application) as client:
        assert (await client.get(f"{AUTH}/invite/{first}")).status_code == 400
        preview = await client.get(f"{AUTH}/invite/{second}")
        assert preview.status_code == 200, preview.text
        data = preview.json()["data"]
        assert data["organization_name"] == "Organisasi A"
        assert data["inviter_name"] == "A Owner"
        assert data["access_role"] == "member" and data["email"] == "budi@uji.test"

        accepted = await client.post(
            f"{AUTH}/accept-invite",
            json={"token": second, "full_name": "Budi Santoso", "password": NEW_PASSWORD},
        )
        assert accepted.status_code == 200, accepted.text
        user = accepted.json()["data"]["user"]
        assert user["full_name"] == "Budi Santoso" and user["access_role"] == "member"
        assert user["organization"]["status"] == "active"
        assert (await client.get(PROFILE)).status_code == 200

        twice = await client.post(
            f"{AUTH}/accept-invite",
            json={"token": second, "full_name": "Budi Santoso", "password": NEW_PASSWORD},
        )
        assert twice.status_code == 400

    joined = await owner.post(f"/api/v1/admin/pengguna/resend-invite/{member_id}")
    assert joined.status_code == 409

    async with world.sessions() as session:
        status = await session.scalar(select(Membership.status).where(Membership.id == member_id))
        assert status == "active"
        actions = (await session.scalars(select(AuditLog.action))).all()
        assert {"anggota.undang", "anggota.kirim_ulang", "anggota.terima"} <= set(actions)
