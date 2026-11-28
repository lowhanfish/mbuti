"""
Enkripsi rahasia yang disimpan di database (E4a): AES-256-GCM.

Kunci berasal dari `VAULT_KEY`. Di pengembangan, bila kosong, kunci dibuat sekali di
`VAULT_KEY_FILE` (di luar git) agar API dan worker memakai kunci yang sama. Di produksi
`VAULT_KEY` wajib diisi. Kunci yang hilang membuat isi brankas tidak bisa dibaca lagi.
"""

import base64
import binascii
import functools
import hashlib
import hmac
import os
import secrets
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import parse_vault_key, settings

VERSION = "v1"
NONCE_BYTES = 12


class EncryptionError(Exception):
    """Pesannya tidak boleh memuat isi atau kunci."""


def _read_key_file(path: Path) -> bytes:
    try:
        # Dibuat eksklusif: bila dua proses menyala bersamaan, hanya satu yang menulis
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        pass
    else:
        with os.fdopen(descriptor, "w") as file:
            file.write(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode() + "\n")
    try:
        return parse_vault_key(path.read_text(encoding="ascii"))
    except (OSError, ValueError, binascii.Error):
        raise EncryptionError(f"Berkas kunci {path.name} tidak bisa dibaca.") from None


@functools.lru_cache(maxsize=1)
def _master_key() -> bytes:
    configured = settings.VAULT_KEY.get_secret_value()
    if configured:
        return parse_vault_key(configured)
    if settings.APP_ENV == "production":
        raise EncryptionError("VAULT_KEY wajib diisi di produksi.")
    return _read_key_file(settings.VAULT_KEY_FILE)


def _derived(purpose: str) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=f"mbuti:{purpose}".encode()
    ).derive(_master_key())


def encrypt(value: str, context: str) -> str:
    """`context` (organisasi, baris, kolom) mengikat sandi: tidak bisa dipindah ke baris lain."""
    nonce = secrets.token_bytes(NONCE_BYTES)
    sealed = AESGCM(_derived("enkripsi")).encrypt(nonce, value.encode(), context.encode())
    return f"{VERSION}:{base64.b64encode(nonce + sealed).decode()}"


def decrypt(token: str, context: str) -> str:
    version, _, body = token.partition(":")
    try:
        if version != VERSION:
            raise ValueError
        raw = base64.b64decode(body, validate=True)
        plain = AESGCM(_derived("enkripsi")).decrypt(
            raw[:NONCE_BYTES], raw[NONCE_BYTES:], context.encode()
        )
    except (ValueError, binascii.Error, InvalidTag):
        raise EncryptionError(
            "Rahasia tersimpan tidak bisa dibuka. Periksa apakah VAULT_KEY berubah."
        ) from None
    return plain.decode()


def fingerprint(value: str) -> str:
    """Sidik jari berkunci untuk kode cadangan: isi database saja tidak cukup untuk menebaknya."""
    return hmac.new(_derived("sidik-jari"), value.encode(), hashlib.sha256).hexdigest()
