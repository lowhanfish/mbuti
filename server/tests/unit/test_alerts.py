"""Pemberitahuan email pemeriksaan kesehatan: kapan dikirim, dan tidak dikirim berulang."""

import datetime

import pytest

from app.core.config import Settings, settings
from app.services import alerts
from app.services.monitor import FAIL, OK, WARN, Finding

T0 = datetime.datetime(2026, 11, 27, 8, 0, tzinfo=datetime.UTC)
REDIS_DOWN = Finding(FAIL, "redis", "Tidak bisa dihubungi.")
DB_OK = Finding(OK, "database", "Tersambung.")
DISK_LOW = Finding(WARN, "disk", "Sisa 2 GB.")


@pytest.fixture
def outbox(monkeypatch, tmp_path) -> list:
    sent: list = []
    monkeypatch.setattr(settings, "ALERT_EMAILS", ["pengelola@uji.test", "cadangan@uji.test"])
    monkeypatch.setattr(settings, "ALERT_REMIND_HOURS", 6)
    monkeypatch.setattr(settings, "ALERT_STATE_FILE", tmp_path / "status.json")
    monkeypatch.setattr(alerts.mailer, "deliver", sent.append)
    return sent


def test_failure_reminder_and_recovery(outbox):
    assert alerts.notify([DB_OK, DISK_LOW], T0) is None
    assert outbox == []

    assert alerts.notify([DB_OK, REDIS_DOWN, DISK_LOW], T0) == "gagal"
    assert [e.to for e in outbox] == ["pengelola@uji.test", "cadangan@uji.test"]
    assert "redis: Tidak bisa dihubungi." in outbox[0].text
    assert "disk: PERINGATAN" in outbox[0].text
    assert outbox[0].subject.startswith("MBUTI gagal: 1 pemeriksaan")

    # Pemeriksaan tiap 5 menit tidak mengirim ulang sebelum waktunya
    outbox.clear()
    assert alerts.notify([REDIS_DOWN], T0 + datetime.timedelta(minutes=5)) is None
    assert alerts.notify([REDIS_DOWN], T0 + datetime.timedelta(hours=5, minutes=55)) is None
    assert alerts.notify([REDIS_DOWN], T0 + datetime.timedelta(hours=6)) == "pengingat"
    assert outbox[0].subject.startswith("MBUTI masih gagal")

    outbox.clear()
    assert alerts.notify([DB_OK], T0 + datetime.timedelta(hours=7)) == "pulih"
    assert "Sebelumnya gagal: redis." in outbox[0].text
    outbox.clear()
    assert alerts.notify([DB_OK], T0 + datetime.timedelta(hours=8)) is None
    assert outbox == []


def test_new_failure_is_sent_immediately(outbox):
    alerts.notify([REDIS_DOWN], T0)
    outbox.clear()
    worse = [REDIS_DOWN, Finding(FAIL, "database", "Gagal diperiksa (TimeoutError).")]
    assert alerts.notify(worse, T0 + datetime.timedelta(minutes=5)) == "gagal"
    assert outbox[0].subject.startswith("MBUTI gagal: 2 pemeriksaan")


def test_failed_delivery_is_retried_next_run(outbox, monkeypatch):
    def broken(_email):
        raise OSError("smtp mati")

    monkeypatch.setattr(alerts.mailer, "deliver", broken)
    with pytest.raises(OSError):
        alerts.notify([REDIS_DOWN], T0)
    assert not settings.ALERT_STATE_FILE.exists()

    monkeypatch.setattr(alerts.mailer, "deliver", outbox.append)
    assert alerts.notify([REDIS_DOWN], T0 + datetime.timedelta(minutes=5)) == "gagal"


def test_without_recipients_nothing_happens(outbox, monkeypatch):
    monkeypatch.setattr(settings, "ALERT_EMAILS", [])
    assert alerts.notify([REDIS_DOWN], T0) is None
    assert outbox == [] and not settings.ALERT_STATE_FILE.exists()


def test_broken_state_file_is_ignored(outbox):
    settings.ALERT_STATE_FILE.write_text("bukan json")
    assert alerts.notify([REDIS_DOWN], T0) == "gagal"


def test_alert_emails_accept_comma_list():
    parsed = Settings(ALERT_EMAILS="a@uji.test, b@uji.test ,")
    assert parsed.ALERT_EMAILS == ["a@uji.test", "b@uji.test"]
