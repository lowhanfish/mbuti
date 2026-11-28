"""Pengganti worker dan model untuk menguji mesin peramban tanpa database."""

import re
from dataclasses import dataclass, field

from app.core.totp import TotpKey
from app.services.vault.secrets import Credentials
from scripts.aplikasi_tiruan import PASSWORD, TOTP_SECRET, USERNAME, MockApp


@dataclass
class FakeHooks:
    otp: str | None = None
    events: list[tuple] = field(default_factory=list)
    shots: list[bytes] = field(default_factory=list)
    submitted: int = 0
    asked_otp: int = 0

    async def event(self, message, status="done", step_no=None, shot=None) -> int:
        self.events.append((message, status, step_no))
        if shot:
            self.shots.append(shot)
        return len(self.events)

    async def checkpoint(self) -> None:
        pass

    async def before_risk(self) -> None:
        self.submitted += 1

    async def wait_otp(self, question, shot) -> str | None:
        self.asked_otp += 1
        return self.otp


class ScriptedModel:
    """
    Menjawab menurut naskah `(tindakan, nama elemen, sumber, kunci atau teks)`. Nomor elemen
    dicari di permintaan, seperti yang dilakukan model sungguhan.
    """

    def __init__(self, *script: tuple):
        self.script = list(script)
        self.prompts: list[str] = []

    async def __call__(self, system: str, user: str, schema: dict) -> dict:
        self.prompts.append(user)
        if not self.script:
            return {"action": "done"}
        action, name, source, value = (*self.script.pop(0), "", "", "")[:4]
        if action in ("done", "fail"):
            return {"action": action, "reason": name}
        found = re.search(rf'^\[(\d+)\] \S+ "{re.escape(name)}"', user, re.MULTILINE)
        assert found, f"Elemen {name!r} tidak ada di halaman:\n{user}"
        answer = {"action": action, "element": int(found.group(1)), "source": source}
        answer["text" if source == "text" or action == "read" else "key"] = value
        return answer


def credentials(app: MockApp, *, totp: bool = False, password: str = PASSWORD) -> Credentials:
    return Credentials(
        url=f"{app.url}/masuk",
        origins=frozenset({app.url}),
        username=USERNAME,
        password=password,
        totp=TotpKey(TOTP_SECRET) if totp else None,
    )


LOGIN = (
    ("fill", "Username", "secret", "username"),
    ("fill", "Password", "secret", "password"),
    ("click", "Masuk"),
)
REPORT = (
    ("click", "Laporan Harian"),
    ("click", "Tambah laporan"),
    ("fill", "Tanggal", "input", "tanggal"),
    ("fill", "Uraian kegiatan", "input", "uraian"),
    ("select", "Jenis", "text", "Lembur"),
    ("check", "Data sudah benar"),
    ("click", "Kirim laporan"),
)
INPUTS = [
    {"key": "tanggal", "label": "Tanggal", "sample": "2026-11-29"},
    {"key": "uraian", "label": "Uraian", "sample": "Rapat koordinasi pagi"},
]
