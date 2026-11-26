"""Pengiriman tugas ke antrean dan percobaan ulang worker, tanpa Redis maupun database."""

import uuid

import pytest
from celery.exceptions import Retry

from app.services.engine.dispatch import enqueue_task
from app.services.engine.execution import RetryLater
from app.workers import execution
from app.workers.celery_app import celery_app


async def test_enqueue_failure_is_not_raised(monkeypatch):
    def broken(**_):
        raise ConnectionError("redis mati")

    monkeypatch.setattr(execution.execute_task, "apply_async", broken)

    await enqueue_task(uuid.uuid4())


def test_one_message_per_step(monkeypatch):
    sent = []
    monkeypatch.setattr(execution, "_run", lambda job: True)
    monkeypatch.setattr(execution.execute_task, "apply_async", lambda args: sent.append(args))

    execution.execute_task.run("a3b1c2d4-0000-0000-0000-000000000001")

    assert sent == [["a3b1c2d4-0000-0000-0000-000000000001"]]


def test_waiting_model_is_retried(monkeypatch):
    def unavailable(job):
        raise RetryLater(60)

    waits = []

    def retry(countdown):
        waits.append(countdown)
        return Retry()

    monkeypatch.setattr(execution, "_run", unavailable)
    monkeypatch.setattr(execution.execute_task, "retry", retry)

    with pytest.raises(Retry):
        execution.execute_task.run("a3b1c2d4-0000-0000-0000-000000000001")
    assert waits == [60]


def test_recovery_is_scheduled():
    entry = celery_app.conf.beat_schedule
    assert "app.workers.execution.recover_stalled" in {job["task"] for job in entry.values()}
    assert "app.workers.execution" in celery_app.conf.include
