"""
Membuka isi brankas. Hanya modul ini yang mendekripsi; hasilnya tidak boleh masuk log,
jejak audit, jawaban API (kecuali alamat dan username), atau permintaan ke model.
"""

import json
from dataclasses import asdict, dataclass

from app.core import encryption
from app.core.totp import TotpKey
from app.models import VaultAccount


def _context(account: VaultAccount, column: str) -> str:
    return f"vault:{account.organization_id}:{account.id}:{column}"


def seal(account: VaultAccount, column: str, value: str) -> None:
    """`account.id` dan `organization_id` harus sudah terisi."""
    setattr(account, f"{column}_encrypted", encryption.encrypt(value, _context(account, column)))


def open_text(account: VaultAccount, column: str) -> str:
    return encryption.decrypt(getattr(account, f"{column}_encrypted"), _context(account, column))


def other_urls(account: VaultAccount) -> list[str]:
    return json.loads(open_text(account, "other_urls"))


def seal_totp(account: VaultAccount, key: TotpKey | None) -> None:
    if key is None:
        account.totp_encrypted = None
    else:
        seal(account, "totp", json.dumps(asdict(key)))


def totp_key(account: VaultAccount) -> TotpKey | None:
    if account.totp_encrypted is None:
        return None
    return TotpKey(**json.loads(open_text(account, "totp")))


@dataclass(frozen=True, repr=False)
class Credentials:
    """Untuk program yang membuka aplikasi. `repr` sengaja tidak memuat isinya."""

    url: str
    origins: frozenset[str]
    username: str
    password: str
    totp: TotpKey | None
