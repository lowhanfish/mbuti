"""Pengiriman email layanan (antrean `default`)."""

import smtplib
from typing import Any

from app.services.mailer import Email, deliver
from app.workers.celery_app import celery_app


@celery_app.task(
    name="app.workers.mail.send_email",
    autoretry_for=(OSError, smtplib.SMTPException),
    retry_backoff=30,
    retry_backoff_max=600,
    max_retries=6,
)
def send_email(email: dict[str, Any]) -> None:
    """Gangguan jaringan atau SMTP diulang dengan jeda yang makin panjang."""
    deliver(Email(**email))
