"""Akun brankas yang boleh dipakai program, beserta sesi tersimpannya."""

import json

from app.models import Agent, Membership, VaultAccount
from app.services.vault import secrets
from app.services.vault.addresses import origin_of

DELETED = "Akun brankas alur ini sudah dihapus."
LOCKED = "Akun brankas perlu dikonfirmasi penanggung jawab di tab Brankas."
BLOCKED = (
    "Akun brankas ini gagal masuk sebelumnya. Ganti passwordnya atau konfirmasi di tab Brankas."
)


def is_locked(account: VaultAccount, responsible: Membership | None) -> bool:
    """Tidak dipakai sampai penanggung jawab yang sekarang menyimpan atau mengonfirmasinya."""
    return (
        responsible is None
        or responsible.status != "active"
        or account.responsible_member_id != responsible.id
    )


def problem(
    account: VaultAccount | None, agent: Agent, responsible: Membership | None
) -> str | None:
    """Alasan akun tidak boleh dipakai sekarang, atau None."""
    if account is None or account.agent_id != agent.id:
        return DELETED
    if is_locked(account, responsible):
        return LOCKED
    if account.login_blocked_at is not None:
        return BLOCKED
    return None


def credentials(account: VaultAccount) -> secrets.Credentials:
    url = secrets.open_text(account, "url")
    origins = frozenset(origin_of(u) for u in [url, *secrets.other_urls(account)])
    return secrets.Credentials(
        url=url,
        origins=origins,
        username=secrets.open_text(account, "username"),
        password=secrets.open_text(account, "password"),
        totp=secrets.totp_key(account),
    )


def stored_session(account: VaultAccount) -> dict | None:
    if account.session_encrypted is None:
        return None
    return json.loads(secrets.open_text(account, "session"))


def keep_session(account: VaultAccount, state: dict | None) -> None:
    if state is None:
        account.session_encrypted = None
    else:
        secrets.seal(account, "session", json.dumps(state))
