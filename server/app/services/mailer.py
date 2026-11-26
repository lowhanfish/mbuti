"""
Email layanan: isi pesan dan pengirimannya.

API hanya menyusun pesan lalu memasukkannya ke antrean (`queue`); worker yang mengirim
(`app.workers.mail.send_email`). Dengan `EMAIL_BACKEND=console` isi email ditulis ke log worker,
sehingga pengembangan tidak butuh layanan email sungguhan.
"""

import html
import logging
import smtplib
from dataclasses import asdict, dataclass
from email.message import EmailMessage
from email.utils import make_msgid

from app.core.config import settings

logger = logging.getLogger("mbuti.mail")

TOKEN_TTL_LABEL = {"verify": "24 jam", "reset": "1 jam", "invite": "7 hari"}


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    text: str
    # Tautan utama, ditampilkan sebagai tombol di versi HTML
    link: str | None = None
    link_label: str | None = None


def _one_line(value: str) -> str:
    """Nama dari pengguna tidak boleh memecah baris kepala email."""
    return " ".join(value.split())


def render_html(email: Email) -> str:
    paragraphs = "".join(
        f'<p style="margin:0 0 14px">{html.escape(part).replace(chr(10), "<br>")}</p>'
        for part in email.text.split("\n\n")
        if part.strip()
    )
    button = ""
    if email.link:
        button = (
            f'<p style="margin:22px 0"><a href="{html.escape(email.link, quote=True)}" '
            'style="background:#7c4dff;color:#fff;text-decoration:none;padding:11px 20px;'
            f'border-radius:12px;font-weight:600">{html.escape(email.link_label or "Buka")}</a></p>'
            '<p style="font-size:12px;color:#6b6480">'
            f"Bila tombol tidak berfungsi, salin alamat ini: {html.escape(email.link)}</p>"
        )
    return (
        '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#18122b;'
        f'max-width:520px">{paragraphs}{button}'
        '<p style="font-size:12px;color:#6b6480;margin-top:28px">MBUTI · kantor AI yang bekerja '
        "dari SOP Anda</p></div>"
    )


def _text_with_link(email: Email) -> str:
    if not email.link:
        return email.text
    return f"{email.text}\n\n{email.link_label or 'Tautan'}: {email.link}"


def build_message(email: Email) -> EmailMessage:
    message = EmailMessage()
    message["From"] = settings.EMAIL_FROM
    message["To"] = email.to
    message["Subject"] = _one_line(email.subject)
    message["Message-ID"] = make_msgid(domain="mbuti")
    message.set_content(_text_with_link(email))
    message.add_alternative(render_html(email), subtype="html")
    return message


def deliver(email: Email) -> None:
    """Kirim sekarang. Dipanggil worker; galat jaringan dibiarkan naik agar diulang."""
    if settings.EMAIL_BACKEND == "console":
        logger.info(
            "Email (console) untuk %s | %s\n%s", email.to, email.subject, _text_with_link(email)
        )
        return
    message = build_message(email)
    with smtplib.SMTP(
        settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS
    ) as smtp:
        if settings.SMTP_STARTTLS:
            smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD.get_secret_value())
        smtp.send_message(message)
    logger.info("Email terkirim ke %s: %s", email.to, email.subject)


def queue(email: Email) -> None:
    """
    Masukkan ke antrean. Jawaban API tidak menunggu email terkirim, dan antrean yang mati
    tidak menggagalkan tindakan pengguna (tautan bisa diminta ulang).
    """
    from app.workers.mail import send_email

    try:
        send_email.apply_async(args=[asdict(email)])
    except Exception:
        logger.exception("Email untuk %s gagal dimasukkan ke antrean", email.to)


# ==========================
# ISI EMAIL
# ==========================


def verification(to: str, name: str, token: str) -> Email:
    return Email(
        to=to,
        subject="Verifikasi email akun MBUTI",
        text=(
            f"Halo {name},\n\nKlik tautan di bawah untuk memverifikasi email dan mengaktifkan akun "
            f"MBUTI Anda. Tautan berlaku {TOKEN_TTL_LABEL['verify']}.\n\n"
            "Bila Anda tidak mendaftar, abaikan email ini."
        ),
        link=settings.app_link(f"/verifikasi?token={token}"),
        link_label="Verifikasi email",
    )


def already_registered(to: str, name: str) -> Email:
    return Email(
        to=to,
        subject="Anda sudah punya akun MBUTI",
        text=(
            f"Halo {name},\n\nSeseorang (mungkin Anda) mencoba mendaftar dengan email ini, padahal "
            "akunnya sudah ada. Silakan masuk, atau atur ulang kata sandi bila lupa.\n\n"
            "Bila bukan Anda, abaikan email ini."
        ),
        link=settings.app_link("/lupa-sandi"),
        link_label="Atur ulang kata sandi",
    )


def password_reset(to: str, name: str, token: str) -> Email:
    return Email(
        to=to,
        subject="Atur ulang kata sandi MBUTI",
        text=(
            f"Halo {name},\n\nKami menerima permintaan atur ulang kata sandi. Tautan berlaku "
            f"{TOKEN_TTL_LABEL['reset']} dan hanya bisa dipakai sekali.\n\n"
            "Bila Anda tidak memintanya, abaikan email ini; kata sandi Anda tidak berubah."
        ),
        link=settings.app_link(f"/atur-ulang-sandi?token={token}"),
        link_label="Atur ulang kata sandi",
    )


def password_changed(to: str, name: str) -> Email:
    return Email(
        to=to,
        subject="Kata sandi MBUTI Anda diubah",
        text=(
            f"Halo {name},\n\nKata sandi akun MBUTI Anda baru saja diubah dan semua sesi lama "
            "sudah dikeluarkan. Bila bukan Anda yang mengubahnya, segera atur ulang kata sandi dan "
            "hubungi admin organisasi."
        ),
    )


def invitation(to: str, name: str, organization: str, inviter: str, token: str) -> Email:
    return Email(
        to=to,
        subject=f"Undangan bergabung ke {organization} di MBUTI",
        text=(
            f"Halo {name},\n\n{inviter} mengundang Anda bergabung ke {organization} di MBUTI. "
            f"Tautan berlaku {TOKEN_TTL_LABEL['invite']}."
        ),
        link=settings.app_link(f"/undangan?token={token}"),
        link_label="Terima undangan",
    )


def organization_approved(to: str, name: str, organization: str) -> Email:
    return Email(
        to=to,
        subject=f"{organization} sudah bisa memakai MBUTI",
        text=(
            f"Halo {name},\n\n{organization} sudah disetujui. Silakan masuk dan mulai menyusun "
            "unit, role, dan dokumen pertama."
        ),
        link=settings.app_link("/login"),
        link_label="Masuk",
    )
