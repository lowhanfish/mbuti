"""Verifikasi dua langkah dan brankas role (E4a, kontrak API bagian 21)."""

import uuid

import pytest
from sqlalchemy import select, update

from app.core import totp
from app.models import Agent, AuditLog, VaultAccount
from app.services import two_factor
from tests.integration.world import PASSWORD, add_agents, new_client

LOGIN = "/api/v1/auth/login"
MFA = "/api/v1/auth/dua-langkah"
SECRET = "JBSWY3DPEHPK3PXP"
APP_PASSWORD = "sandi-aplikasi-contoh"


class Clock:
    """Waktu buatan untuk kode authenticator: tiap kode baru memakai putaran berikutnya."""

    def __init__(self) -> None:
        self.now = 1_800_000_000.0

    def time(self) -> float:
        return self.now

    def code(self, secret: str) -> str:
        self.now += 30
        return totp.TotpKey(secret).code_at(self.now)


@pytest.fixture
def clock(monkeypatch) -> Clock:
    fake = Clock()
    monkeypatch.setattr(two_factor, "time", fake)
    return fake


async def enable(client, clock) -> tuple[str, list[str]]:
    started = await client.post(f"{MFA}/mulai", json={"password": PASSWORD})
    assert started.status_code == 200, started.text
    secret = started.json()["data"]["secret"]
    assert started.json()["data"]["qr_svg"].startswith("data:image/svg+xml")
    done = await client.post(f"{MFA}/aktifkan", json={"code": clock.code(secret)})
    assert done.status_code == 200, done.text
    return secret, done.json()["data"]["recovery_codes"]


async def test_two_step_login(application, world, sign_in, clock):
    client = await sign_in("a_owner")
    other = await sign_in("a_owner")
    wrong = await client.post(f"{MFA}/mulai", json={"password": "salah-sekali"})
    assert wrong.status_code == 422
    secret, recovery = await enable(client, clock)
    # Sesi lain dicabut, sesi ini tetap hidup
    assert (await other.get("/api/v1/auth/me")).status_code == 401
    me = await client.get("/api/v1/auth/me")
    assert me.json()["data"]["user"]["two_factor_enabled"] is True

    credentials = {"email": world.email("a_owner"), "password": PASSWORD}
    async with new_client(application) as visitor:
        needed = await visitor.post(LOGIN, json=credentials)
        assert (needed.status_code, needed.json()["code"]) == (403, "two_factor_required")
        assert "access_token" not in visitor.cookies
        # Kata sandi salah tidak mengungkap bahwa akunnya memakai verifikasi dua langkah
        guess = await visitor.post(LOGIN, json={**credentials, "password": "salah-sekali"})
        assert guess.status_code == 401 and "code" not in guess.json()

        used = totp.TotpKey(secret).code_at(clock.now)
        replay = await visitor.post(LOGIN, json={**credentials, "code": used})
        assert (replay.status_code, replay.json()["code"]) == (422, "two_factor_invalid")

        good = await visitor.post(LOGIN, json={**credentials, "code": clock.code(secret)})
        assert good.status_code == 200, good.text
        first = await visitor.post(LOGIN, json={**credentials, "code": recovery[0]})
        assert first.status_code == 200, first.text
        again = await visitor.post(LOGIN, json={**credentials, "code": recovery[0]})
        assert again.status_code == 422

    status = await client.get(MFA)
    assert status.json()["data"]["recovery_codes_left"] == len(recovery) - 1
    off = await client.post(f"{MFA}/matikan", json={"password": PASSWORD, "code": recovery[1]})
    assert off.status_code == 200, off.text
    async with new_client(application) as visitor:
        assert (await visitor.post(LOGIN, json=credentials)).status_code == 200


async def test_wrong_codes_are_limited_per_account(sign_in, clock):
    client = await sign_in("a_owner")
    _, recovery = await enable(client, clock)
    statuses = [
        (await client.post(f"{MFA}/kode-cadangan", json={"code": "000000x"})).status_code
        for _ in range(6)
    ]

    assert statuses == [422] * 5 + [429]
    blocked = await client.post(f"{MFA}/kode-cadangan", json={"code": recovery[0]})
    assert blocked.status_code == 429


async def set_responsible(world, agent_id: str, name: str) -> None:
    async with world.sessions() as session:
        await session.execute(
            update(Agent)
            .where(Agent.id == uuid.UUID(agent_id))
            .values(owner_member_id=world.members[name].id)
        )
        await session.commit()


async def test_vault_belongs_to_the_responsible_person(world, sign_in, clock):
    [agent] = await add_agents(world, "a", "Rani")
    url = f"/api/v1/admin/role/{agent}/brankas"
    await set_responsible(world, agent, "a_member")
    owner, member = await sign_in("a_owner"), await sign_in("a_member")
    account = {
        "name": "Aplikasi Contoh",
        "url": "https://app.contoh.test/masuk",
        "other_urls": [],
        "username": "operator.uji",
        "password": APP_PASSWORD,
        "totp_key": SECRET,
        "remove_totp": False,
        "code": "000000",
    }

    off = (await member.get(url)).json()["data"]["access"]
    assert off["blocker"] == "two_factor_off"
    assert (await member.post(url, json=account)).status_code == 403
    secret, _ = await enable(member, clock)
    # Pemilik organisasi pun tidak boleh mengubah brankas role orang lain
    assert (await owner.get(url)).json()["data"]["access"]["blocker"] == "not_responsible"
    assert (await owner.post(url, json=account)).status_code == 403

    wrong = await member.post(url, json=account)
    assert (wrong.status_code, wrong.json()["code"]) == (422, "two_factor_invalid")
    created = await member.post(url, json={**account, "code": clock.code(secret)})
    assert created.status_code == 201, created.text
    assert APP_PASSWORD not in created.text and SECRET not in created.text
    item = created.json()["data"]
    assert item["username"] == "operator.uji" and item["has_totp"] and not item["locked"]
    async with world.sessions() as session:
        row = await session.scalar(select(VaultAccount))
        stored = " ".join(str(getattr(row, c.name)) for c in VaultAccount.__table__.columns)
    for plain in (APP_PASSWORD, SECRET, "operator.uji", "app.contoh.test"):
        assert plain not in stored

    # Alamat situs lain mewajibkan password dan kunci diketik ulang
    moved = {**account, "url": "https://jahat.test/", "password": "", "totp_key": ""}
    refused = await member.put(f"{url}/{item['id']}", json={**moved, "code": clock.code(secret)})
    assert refused.status_code == 422 and "password" in refused.json()["message"]
    renamed = {**account, "name": "Kinerja", "password": "", "totp_key": ""}
    kept = await member.put(f"{url}/{item['id']}", json={**renamed, "code": clock.code(secret)})
    assert kept.status_code == 200 and kept.json()["data"]["has_totp"], kept.text

    shown = await member.post(f"{url}/{item['id']}/kode", json={"code": clock.code(secret)})
    assert shown.status_code == 200, shown.text
    assert shown.json()["data"]["code"].isdigit()

    # Organisasi lain tidak melihat role maupun akunnya
    outsider = await sign_in("b_owner")
    assert (await outsider.get(url)).status_code == 404
    gone = await outsider.post(f"{url}/{item['id']}/hapus", json={"code": "000000"})
    assert gone.status_code == 404

    # Penanggung jawab berganti: terkunci sampai dikonfirmasi yang baru
    await set_responsible(world, agent, "a_owner")
    new_secret, _ = await enable(owner, clock)
    assert (await owner.get(url)).json()["data"]["accounts"][0]["locked"] is True
    hidden = (await member.get(url)).json()["data"]["accounts"][0]
    assert hidden["username"] == ""
    locked = await owner.post(f"{url}/{item['id']}/kode", json={"code": clock.code(new_secret)})
    assert locked.status_code == 409
    confirmed = await owner.post(
        f"{url}/{item['id']}/konfirmasi", json={"code": clock.code(new_secret)}
    )
    assert confirmed.status_code == 200 and confirmed.json()["data"]["locked"] is False

    async with world.sessions() as session:
        entries = (await session.scalars(select(AuditLog))).all()
    targets = {e.target for e in entries if e.action.startswith("brankas.")}
    assert "Aplikasi Contoh · Rani" in targets and "Kinerja · Rani" in targets
    logged = " ".join(e.target for e in entries)
    assert APP_PASSWORD not in logged and SECRET not in logged

    assert (await owner.delete(f"/api/v1/admin/role/delete/{agent}")).status_code == 200
    async with world.sessions() as session:
        assert (await session.scalar(select(VaultAccount.id))) is None
