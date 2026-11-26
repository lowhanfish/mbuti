"""
Pemberitahuan email dari pemeriksaan kesehatan (`scripts.periksa`).

Pemeriksaan berjalan tiap 5 menit, jadi email hanya dikirim bila perlu:
- ada pemeriksaan GAGAL yang baru, atau pesan gagalnya berubah;
- masih gagal dan pengingat terakhir sudah lewat `ALERT_REMIND_HOURS`;
- semuanya pulih setelah sebelumnya gagal.

Email dikirim langsung (bukan lewat antrean Redis), karena yang rusak bisa saja Redis atau
worker itu sendiri. Keadaan terakhir disimpan di berkas JSON kecil.
"""

import datetime
import json
import logging
import socket
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.services import mailer
from app.services.monitor import FAIL, Finding

logger = logging.getLogger("mbuti.alerts")


@dataclass(frozen=True)
class State:
    # Nama pemeriksaan → pesan gagal saat pemberitahuan terakhir
    failing: dict[str, str]
    notified_at: datetime.datetime | None


EMPTY = State(failing={}, notified_at=None)


def load_state(path: Path) -> State:
    try:
        raw = json.loads(path.read_text())
        notified = raw.get("notified_at")
        return State(
            failing=dict(raw.get("failing", {})),
            notified_at=datetime.datetime.fromisoformat(notified) if notified else None,
        )
    except (OSError, ValueError, TypeError, AttributeError):
        return EMPTY


def save_state(path: Path, state: State) -> None:
    payload = {
        "failing": state.failing,
        "notified_at": state.notified_at.isoformat() if state.notified_at else None,
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    tmp.replace(path)


def decide(
    previous: State, findings: list[Finding], now: datetime.datetime
) -> tuple[str | None, State]:
    """
    Tentukan jenis email (`"gagal"`, `"pengingat"`, `"pulih"`, atau None) dan keadaan barunya.
    Keadaan baru hanya dipakai bila emailnya berhasil terkirim (atau tidak perlu email).
    """
    failing = {f.name: f.message for f in findings if f.level == FAIL}
    if failing:
        if failing != previous.failing:
            return "gagal", State(failing, now)
        remind = datetime.timedelta(hours=settings.ALERT_REMIND_HOURS)
        if previous.notified_at is None or now - previous.notified_at >= remind:
            return "pengingat", State(failing, now)
        return None, previous
    if previous.failing:
        return "pulih", State({}, now)
    return None, previous


def compose(kind: str, findings: list[Finding], previous: State, to: str) -> mailer.Email:
    host = socket.gethostname()
    if kind == "pulih":
        recovered = ", ".join(sorted(previous.failing))
        return mailer.Email(
            to=to,
            subject=f"MBUTI pulih: semua pemeriksaan OK ({host})",
            text=(
                f"Semua pemeriksaan kesehatan di {host} kembali normal.\n\n"
                f"Sebelumnya gagal: {recovered}."
            ),
        )
    failed = [f for f in findings if f.level == FAIL]
    lines = "\n".join(f"- {f.name}: {f.message}" for f in failed)
    others = "\n".join(f"- {f.name}: {f.level} {f.message}" for f in findings if f.level != FAIL)
    prefix = "Masih gagal" if kind == "pengingat" else "Gagal"
    return mailer.Email(
        to=to,
        subject=f"MBUTI {prefix.lower()}: {len(failed)} pemeriksaan ({host})",
        text=(
            f"{prefix} pada pemeriksaan kesehatan di {host}:\n{lines}\n\n"
            f"Pemeriksaan lain:\n{others or '-'}\n\n"
            "Periksa dengan:  python -m scripts.periksa\n"
            f"Pengingat dikirim ulang setiap {settings.ALERT_REMIND_HOURS} jam selama masih gagal."
        ),
    )


def notify(findings: list[Finding], now: datetime.datetime | None = None) -> str | None:
    """
    Kirim email bila perlu. Mengembalikan jenis email yang terkirim, atau None.
    Bila pengiriman gagal, keadaan lama dipertahankan agar dicoba lagi pada pemeriksaan berikutnya.
    """
    recipients = settings.ALERT_EMAILS
    if not recipients:
        return None
    now = now or datetime.datetime.now(datetime.UTC)
    path = settings.ALERT_STATE_FILE
    previous = load_state(path)
    kind, state = decide(previous, findings, now)
    if kind is None:
        return None
    try:
        for to in recipients:
            mailer.deliver(compose(kind, findings, previous, to))
    except Exception as exc:
        logger.error("Pemberitahuan pemantauan gagal dikirim: %s", type(exc).__name__)
        raise
    save_state(path, state)
    return kind
