"""
Aplikasi Celery.

Antrean `ingestion` (olah dokumen, B3) dan `execution` (kerja role, B5) dipisah agar olah dokumen
besar tidak menahan tugas. Worker tanpa opsi `-Q` melayani semua antrean di bawah.
"""

from typing import Any

from celery import Celery
from celery.signals import setup_logging as celery_setup_logging
from kombu import Queue

from app.core.config import settings
from app.core.logging import setup_logging

celery_app = Celery(
    "mbuti",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.system",
        "app.workers.mail",
        "app.workers.ingestion",
        "app.workers.execution",
        "app.workers.formation",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_default_queue="default",
    task_queues=(Queue("default"), Queue("ingestion"), Queue("execution")),
    task_routes={
        "app.workers.ingestion.*": {"queue": "ingestion"},
        "app.workers.execution.*": {"queue": "execution"},
        "app.workers.formation.*": {"queue": "execution"},
    },
    # Pekerjaan baru dianggap selesai setelah dikerjakan, dan diambil satu per satu.
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    result_expires=3600,
    # Dijalankan `celery beat`
    beat_schedule={
        "recover-stalled-tasks": {
            "task": "app.workers.execution.recover_stalled",
            "schedule": 300.0,
        }
    },
)


@celery_setup_logging.connect
def configure_worker_logging(**_: Any) -> None:
    """Pakai format log yang sama dengan API."""
    setup_logging()
