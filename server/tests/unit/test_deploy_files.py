"""Berkas pemasangan harus tetap cocok dengan kodenya (nama antrean, modul, dan pengaturan)."""

import importlib
import re

from app.core.config import SERVER_DIR, Settings
from app.workers.celery_app import celery_app

DEPLOY = SERVER_DIR.parent / "deploy"
SERVICES = sorted((DEPLOY / "systemd").glob("*.service"))


def commands() -> list[str]:
    return [
        line.removeprefix("ExecStart=")
        for path in SERVICES
        for line in path.read_text().splitlines()
        if line.startswith("ExecStart=")
    ]


def test_workers_serve_every_queue_once():
    served = [q for c in commands() for m in re.findall(r"-Q (\S+)", c) for q in m.split(",")]

    assert sorted(served) == sorted(q.name for q in celery_app.conf.task_queues)


def test_modules_in_commands_exist():
    modules = {m for c in commands() for m in re.findall(r"-m (scripts\.\w+)", c)}

    assert modules == {"scripts.cadangan", "scripts.periksa"}
    for module in modules:
        assert callable(importlib.import_module(module).main)
    assert any("uvicorn main:app" in c for c in commands())
    assert any("beat" in c for c in commands())


def test_example_environment_uses_known_settings_and_holds_no_secret():
    lines = (DEPLOY / "env" / "server.env.contoh").read_text().splitlines()
    values = dict(
        line.lstrip("# ").split("=", 1) for line in lines if re.match(r"^(# )?[A-Z_0-9]+=", line)
    )

    unknown = {k for k in values if k not in Settings.model_fields and "GEMINI_API_KEY" not in k}
    assert unknown == set()
    for secret in (
        "DATABASE_URL",
        "JWT_SECRET_KEY",
        "VAULT_KEY",
        "GEMINI_API_KEY",
        "SMTP_PASSWORD",
    ):
        assert values[secret] == ""
    assert values["APP_ENV"] == "production" and values["COOKIE_SECURE"] == "true"
