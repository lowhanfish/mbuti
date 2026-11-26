"""Masuk, sesi, CSRF, dan batas percobaan."""

import datetime

from sqlalchemy import select, update

from app.core.config import settings
from app.models import RefreshSession
from app.models.base import utcnow
from tests.integration.world import PASSWORD, new_client

LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
PROFILE_KEYS = {
    "id",
    "email",
    "full_name",
    "is_active",
    "is_verified",
    "access_role",
    "organization",
    "created_at",
}


async def test_login_sets_cookies_and_returns_profile(application, world):
    async with new_client(application) as client:
        response = await client.post(
            LOGIN, json={"email": "  A_Owner@Uji.test ", "password": PASSWORD}
        )

        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert set(data["user"]) == PROFILE_KEYS
        assert data["user"]["access_role"] == "owner"
        assert data["user"]["organization"]["slug"] == "org-uji-a"
        assert data["user"]["created_at"].endswith("Z")
        assert data["csrf_token"] == client.cookies["csrf_token"]

        cookies = {c.split("=")[0]: c.lower() for c in response.headers.get_list("set-cookie")}
        assert "httponly" in cookies["access_token"] and "samesite=lax" in cookies["access_token"]
        assert "httponly" in cookies["refresh_token"]
        assert "path=/api/v1/auth" in cookies["refresh_token"]
        assert "httponly" not in cookies["csrf_token"]

        me = await client.get(ME)
        assert me.json()["data"]["user"]["email"] == "a_owner@uji.test"

    async with world.sessions() as session:
        stored = (await session.scalars(select(RefreshSession.token_hash))).all()
    assert len(stored) == 1 and len(stored[0]) == 64


async def test_wrong_password_and_unknown_email_look_the_same(application, world):
    async with new_client(application) as client:
        wrong = await client.post(LOGIN, json={"email": "a_owner@uji.test", "password": "salah"})
        unknown = await client.post(LOGIN, json={"email": "tidak@ada.test", "password": PASSWORD})

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["message"] == "Email atau kata sandi salah."
    assert "set-cookie" not in wrong.headers


async def test_invited_user_without_password_cannot_sign_in(application, world):
    async with world.sessions() as session:
        user = await session.merge(world.users["a_member"])
        user.password_hash = None
        await session.commit()

    async with new_client(application) as client:
        response = await client.post(LOGIN, json={"email": "a_member@uji.test", "password": ""})

    assert response.status_code == 401


async def test_disabled_account_or_membership_is_refused(application, world):
    async with world.sessions() as session:
        (await session.merge(world.users["a_member"])).is_active = False
        (await session.merge(world.members["a_viewer"])).status = "disabled"
        await session.commit()

    async with new_client(application) as client:
        account = await client.post(
            LOGIN, json={"email": "a_member@uji.test", "password": PASSWORD}
        )
        membership = await client.post(
            LOGIN, json={"email": "a_viewer@uji.test", "password": PASSWORD}
        )

    assert (account.status_code, membership.status_code) == (403, 403)


async def test_unknown_origin_cannot_sign_in(application, world):
    async with new_client(application) as client:
        response = await client.post(
            LOGIN,
            json={"email": "a_owner@uji.test", "password": PASSWORD},
            headers={"Origin": "https://jahat.example"},
        )

    assert response.status_code == 403


async def test_repeated_failures_are_blocked(application, world):
    async with new_client(application) as client:
        for _ in range(settings.LOGIN_FAILURE_LIMIT):
            response = await client.post(
                LOGIN, json={"email": "a_owner@uji.test", "password": "salah"}
            )
            assert response.status_code == 401
        blocked = await client.post(LOGIN, json={"email": "a_owner@uji.test", "password": PASSWORD})
        other = await client.post(LOGIN, json={"email": "a_admin@uji.test", "password": PASSWORD})

    assert blocked.status_code == 429
    assert other.status_code == 200


async def test_me_requires_a_valid_token(application, world):
    async with new_client(application) as client:
        assert (await client.get(ME)).status_code == 401
        client.cookies.set("access_token", "bukan-token")
        response = await client.get(ME)

    assert response.status_code == 401
    assert response.json()["success"] is False


async def test_refresh_requires_csrf(sign_in):
    client = await sign_in("a_owner")
    del client.headers["X-CSRF-Token"]

    assert (await client.post(REFRESH)).status_code == 403


async def test_refresh_without_session_is_unauthorized(application, world):
    async with new_client(application) as client:
        assert (await client.post(REFRESH)).status_code == 401


async def _age_rotations(world) -> None:
    """Mundurkan waktu penggantian token melewati masa tenggang."""
    async with world.sessions() as session:
        await session.execute(
            update(RefreshSession)
            .where(RefreshSession.revoked_reason == "rotated")
            .values(revoked_at=utcnow() - datetime.timedelta(minutes=1))
        )
        await session.commit()


async def test_refresh_rotates_token_and_reuse_revokes_session(application, world, sign_in):
    client = await sign_in("a_owner")
    old = client.cookies["refresh_token"]
    csrf = client.cookies["csrf_token"]

    response = await client.post(REFRESH)
    assert response.status_code == 200, response.text
    assert client.cookies["refresh_token"] != old
    assert client.cookies["csrf_token"] == csrf
    assert (await client.get(ME)).status_code == 200

    await _age_rotations(world)
    async with new_client(application) as thief:
        thief.cookies.set("refresh_token", old)
        thief.cookies.set("csrf_token", csrf)
        reused = await thief.post(REFRESH, headers={"X-CSRF-Token": csrf})

    assert reused.status_code == 401
    # Pemilik asli ikut keluar karena tidak diketahui siapa yang memegang salinan token
    assert (await client.get(ME)).status_code == 401
    assert (await client.post(REFRESH)).status_code == 401


async def test_second_tab_within_grace_period_keeps_session(application, sign_in):
    client = await sign_in("a_owner")
    old = client.cookies["refresh_token"]
    csrf = client.cookies["csrf_token"]
    assert (await client.post(REFRESH)).status_code == 200

    async with new_client(application) as second_tab:
        second_tab.cookies.set("refresh_token", old)
        second_tab.cookies.set("csrf_token", csrf)
        response = await second_tab.post(REFRESH, headers={"X-CSRF-Token": csrf})
        assert response.status_code == 200
        assert "access_token" in second_tab.cookies

    assert (await client.post(REFRESH)).status_code == 200


async def test_logout_revokes_the_session(application, sign_in):
    client = await sign_in("a_owner")
    access = client.cookies["access_token"]

    response = await client.post(LOGOUT)
    assert response.status_code == 200
    assert "access_token" not in client.cookies

    # Token akses lama yang disalin tidak berlaku lagi
    async with new_client(application) as copy:
        copy.cookies.set("access_token", access)
        assert (await copy.get(ME)).status_code == 401


async def test_logout_works_after_access_token_is_gone(world, sign_in):
    client = await sign_in("a_owner")
    client.cookies.delete("access_token")

    assert (await client.post(LOGOUT)).status_code == 200
    async with world.sessions() as session:
        alive = await session.scalar(
            select(RefreshSession.id).where(RefreshSession.revoked_at.is_(None))
        )
    assert alive is None


async def test_logout_without_session_succeeds(application, world):
    async with new_client(application) as client:
        assert (await client.post(LOGOUT)).status_code == 200


async def test_changes_require_matching_csrf_token(sign_in):
    client = await sign_in("a_owner")
    body = {"name": "Unit Baru"}

    missing = await client.post(
        "/api/v1/admin/unit/create", json=body, headers={"X-CSRF-Token": ""}
    )
    wrong = await client.post(
        "/api/v1/admin/unit/create", json=body, headers={"X-CSRF-Token": "lain"}
    )
    good = await client.post("/api/v1/admin/unit/create", json=body)

    assert (missing.status_code, wrong.status_code, good.status_code) == (403, 403, 201)


async def test_user_without_membership_is_refused_on_admin_pages(world, sign_in):
    client = await sign_in("a_member")
    async with world.sessions() as session:
        await session.delete(await session.merge(world.members["a_member"]))
        await session.commit()

    response = await client.get("/api/v1/admin/unit/read")
    me = await client.get(ME)

    assert response.status_code == 403
    assert me.json()["data"]["user"]["access_role"] is None
