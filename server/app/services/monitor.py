"""
Pemeriksaan kesehatan untuk penjadwal: database, Redis, worker, antrean, tugas macet,
ruang disk, dan umur cadangan. Hasilnya daftar temuan; tidak ada data pengguna yang dicetak.
"""

import datetime
import shutil
from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from redis import Redis
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import SERVER_DIR, settings
from app.models import DocumentVersion, Task
from app.models.base import utcnow
from app.workers.celery_app import celery_app

OK, WARN, FAIL = "OK", "PERINGATAN", "GAGAL"
QUEUES = ("default", "ingestion", "execution")
BACKLOG_LIMIT = 100
STUCK_AFTER = datetime.timedelta(minutes=30)
MIN_FREE_BYTES = 1024**3
BACKUP_MAX_AGE = datetime.timedelta(hours=48)


@dataclass(frozen=True)
class Finding:
    level: str
    name: str
    message: str


def head_revision() -> str:
    return ScriptDirectory.from_config(Config(str(SERVER_DIR / "alembic.ini"))).get_current_head()


async def check_database(session: AsyncSession) -> list[Finding]:
    revision = await session.scalar(text("SELECT version_num FROM alembic_version"))
    expected = head_revision()
    if revision != expected:
        return [Finding(FAIL, "database", f"Skema {revision}, seharusnya {expected}.")]
    return [Finding(OK, "database", "Terjangkau dan skemanya terbaru.")]


async def check_work(session: AsyncSession) -> list[Finding]:
    now = utcnow()
    stuck = await session.scalar(
        select(func.count())
        .select_from(Task)
        .where(Task.status.in_(("queued", "running")), Task.updated_at < now - STUCK_AFTER)
    )
    since = now - datetime.timedelta(hours=24)
    failed = await session.scalar(
        select(func.count())
        .select_from(Task)
        .where(Task.status == "failed", Task.updated_at > since)
    )
    documents = await session.scalar(
        select(func.count())
        .select_from(DocumentVersion)
        .where(DocumentVersion.status == "failed", DocumentVersion.created_at > since)
    )
    return [
        Finding(WARN if stuck else OK, "tugas macet", f"{stuck} tugas diam lebih dari 30 menit."),
        Finding(WARN if failed else OK, "tugas gagal", f"{failed} dalam 24 jam."),
        Finding(WARN if documents else OK, "dokumen gagal", f"{documents} dalam 24 jam."),
    ]


def check_queues() -> list[Finding]:
    try:
        with Redis.from_url(settings.celery_broker_url, socket_connect_timeout=3) as client:
            sizes = {queue: client.llen(queue) for queue in QUEUES}
    except Exception as exc:
        return [Finding(FAIL, "redis", f"Tidak terjangkau ({type(exc).__name__}).")]
    found = [Finding(OK, "redis", "Terjangkau.")]
    crowded = {q: n for q, n in sizes.items() if n > BACKLOG_LIMIT}
    summary = ", ".join(f"{q}={n}" for q, n in sizes.items())
    found.append(Finding(WARN if crowded else OK, "antrean", summary))
    return found


def check_workers() -> list[Finding]:
    try:
        active = celery_app.control.inspect(timeout=3).active_queues() or {}
    except Exception as exc:
        return [Finding(FAIL, "worker", f"Tidak bisa diperiksa ({type(exc).__name__}).")]
    served = {queue["name"] for queues in active.values() for queue in queues}
    missing = [q for q in QUEUES if q not in served]
    if missing:
        return [Finding(FAIL, "worker", f"Tidak ada yang melayani antrean: {', '.join(missing)}.")]
    return [Finding(OK, "worker", f"{len(active)} worker melayani semua antrean.")]


def check_disk(folder: Path) -> list[Finding]:
    target = folder if folder.exists() else folder.parent
    free = shutil.disk_usage(target).free
    level = WARN if free < MIN_FREE_BYTES else OK
    return [Finding(level, "disk", f"Sisa {free / 1024**3:.1f} GB di tempat unggahan.")]


def check_backup(folder: Path | None) -> list[Finding]:
    if folder is None:
        return []
    archives = sorted(folder.glob("mbuti-*.tar.gz")) if folder.is_dir() else []
    if not archives:
        return [Finding(FAIL, "cadangan", "Belum ada arsip.")]
    made = datetime.datetime.fromtimestamp(archives[-1].stat().st_mtime, datetime.UTC)
    age = utcnow() - made
    hours = int(age.total_seconds() // 3600)
    level = FAIL if age > BACKUP_MAX_AGE else OK
    return [Finding(level, "cadangan", f"Arsip terbaru berumur {hours} jam.")]
