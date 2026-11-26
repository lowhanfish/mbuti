"""Isi email dan pengirimannya (tanpa SMTP sungguhan)."""

import logging

import pytest

from app.core.config import settings
from app.services import mailer


def test_message_escapes_names_and_keeps_subject_on_one_line():
    email = mailer.invitation(
        "budi@uji.test", "Budi", "Dinas <b>Uji</b>\nBaris baru", "Ani & Co", "token-uji"
    )
    message = mailer.build_message(email)

    assert "\n" not in message["Subject"]
    assert message["To"] == "budi@uji.test"
    text = message.get_body(("plain",)).get_content()
    html = message.get_body(("html",)).get_content()
    assert f"{settings.APP_URL}/undangan?token=token-uji" in text
    assert "&lt;b&gt;Uji&lt;/b&gt;" in html and "<b>Uji</b>" not in html
    assert "Ani &amp; Co" in html


def test_console_backend_logs_instead_of_sending(monkeypatch, caplog):
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "console")

    def no_network(*_args, **_kwargs):
        raise AssertionError("SMTP tidak boleh dipanggil")

    monkeypatch.setattr(mailer.smtplib, "SMTP", no_network)
    with caplog.at_level(logging.INFO, logger="mbuti.mail"):
        mailer.deliver(mailer.password_reset("ani@uji.test", "Ani", "abc"))

    assert "atur-ulang-sandi?token=abc" in caplog.text


def test_queue_failure_does_not_raise(monkeypatch, caplog):
    from app.workers.mail import send_email

    def broken(*_args, **_kwargs):
        raise ConnectionError("broker mati")

    monkeypatch.setattr(send_email, "apply_async", broken)
    with caplog.at_level(logging.ERROR, logger="mbuti.mail"):
        mailer.queue(mailer.password_changed("ani@uji.test", "Ani"))

    assert "gagal dimasukkan ke antrean" in caplog.text


@pytest.mark.parametrize(
    "factory",
    [
        lambda: mailer.verification("a@uji.test", "A", "t"),
        lambda: mailer.already_registered("a@uji.test", "A"),
        lambda: mailer.organization_approved("a@uji.test", "A", "Org"),
    ],
)
def test_every_email_has_text_and_html(factory):
    message = mailer.build_message(factory())
    assert message.get_body(("plain",)).get_content().strip()
    assert "<div" in message.get_body(("html",)).get_content()
