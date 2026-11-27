"""Konfigurasi Celery tanpa broker."""

from app.core.config import settings
from app.workers.celery_app import celery_app
from app.workers.system import ping


def test_queues_are_separate() -> None:
    names = {queue.name for queue in celery_app.conf.task_queues}

    assert names == {"default", "ingestion", "execution"}


def test_tasks_are_routed_to_their_queue() -> None:
    router = celery_app.amqp.router

    assert router.route({}, "app.workers.ingestion.contoh")["queue"].name == "ingestion"
    assert router.route({}, "app.workers.execution.contoh")["queue"].name == "execution"
    # Pembentukan role berbagi antrean dengan eksekusi agar panggilan model tetap satu per satu
    assert router.route({}, "app.workers.formation.contoh")["queue"].name == "execution"
    assert router.route({}, "app.workers.system.ping")["queue"].name == "default"


def test_broker_comes_from_settings() -> None:
    assert celery_app.conf.broker_url == settings.celery_broker_url


def test_ping_task() -> None:
    celery_app.loader.import_default_modules()

    assert "app.workers.system.ping" in celery_app.tasks
    assert ping.apply().get() == "pong"
