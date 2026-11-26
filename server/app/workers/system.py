"""Pekerjaan sistem."""

from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.system.ping")
def ping() -> str:
    """Memastikan worker mengambil dan menyelesaikan pekerjaan."""
    return "pong"
