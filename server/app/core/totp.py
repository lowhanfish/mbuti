"""TOTP (RFC 6238) untuk verifikasi dua langkah dan kunci authenticator di brankas."""

import base64
import binascii
import hashlib
import hmac
import secrets
import struct
from dataclasses import dataclass
from urllib.parse import parse_qs, quote, urlsplit

PERIOD = 30
DIGITS = 6
# Putaran sebelum dan sesudah yang masih diterima, untuk jam ponsel yang sedikit meleset
WINDOW = 1
ALGORITHMS = {"SHA1": hashlib.sha1, "SHA256": hashlib.sha256, "SHA512": hashlib.sha512}
# 80 bit, batas terkecil yang lazim dipakai aplikasi
MIN_SECRET_BYTES = 10
MAX_SECRET_BYTES = 128
BAD_KEY = (
    "Kunci authenticator tidak dikenal. Tempel kunci huruf dan angka, atau alamat otpauth://."
)


@dataclass(frozen=True)
class TotpKey:
    # Base32 huruf besar tanpa isian "="
    secret: str
    digits: int = DIGITS
    period: int = PERIOD
    algorithm: str = "SHA1"

    def code_at(self, timestamp: float) -> str:
        return self.code_for_step(int(timestamp // self.period))

    def code_for_step(self, step: int) -> str:
        digest = hmac.new(
            _decode(self.secret), struct.pack(">Q", step), ALGORITHMS[self.algorithm]
        ).digest()
        offset = digest[-1] & 0x0F
        number = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
        return str(number % 10**self.digits).zfill(self.digits)

    def seconds_left(self, timestamp: float) -> int:
        return self.period - int(timestamp) % self.period

    def matching_step(self, code: str, timestamp: float) -> int | None:
        """Putaran yang cocok dengan kode, atau None."""
        current = int(timestamp // self.period)
        found = None
        # Semua putaran diperiksa agar lama jawabannya tidak bergantung pada posisinya
        for step in range(current - WINDOW, current + WINDOW + 1):
            if hmac.compare_digest(self.code_for_step(step), code):
                found = step
        return found


def _decode(secret: str) -> bytes:
    return base64.b32decode(secret + "=" * (-len(secret) % 8))


def _clean_secret(value: str) -> str:
    secret = "".join(value.split()).replace("-", "").rstrip("=").upper()
    try:
        size = len(_decode(secret))
    except (binascii.Error, ValueError):
        raise ValueError(BAD_KEY) from None
    if not MIN_SECRET_BYTES <= size <= MAX_SECRET_BYTES:
        raise ValueError(BAD_KEY)
    return secret


def generate_key() -> TotpKey:
    return TotpKey(base64.b32encode(secrets.token_bytes(20)).decode().rstrip("="))


def parse_key(value: str) -> TotpKey:
    """Kunci dari aplikasi tujuan: base32, atau alamat `otpauth://totp/...`."""
    value = value.strip()
    if not value.lower().startswith("otpauth://"):
        return TotpKey(_clean_secret(value))
    try:
        parts = urlsplit(value)
        query = {k.lower(): v[0] for k, v in parse_qs(parts.query).items()}
        digits = int(query.get("digits", DIGITS))
        period = int(query.get("period", PERIOD))
    except ValueError:
        raise ValueError(BAD_KEY) from None
    algorithm = query.get("algorithm", "SHA1").upper()
    if (
        parts.netloc.lower() != "totp"
        or digits not in (6, 7, 8)
        or not 15 <= period <= 120
        or algorithm not in ALGORITHMS
    ):
        raise ValueError(BAD_KEY)
    return TotpKey(_clean_secret(query.get("secret", "")), digits, period, algorithm)


def otpauth_url(key: TotpKey, account: str, issuer: str) -> str:
    label = quote(f"{issuer}:{account}", safe=":@")
    return (
        f"otpauth://totp/{label}?secret={key.secret}&issuer={quote(issuer)}"
        f"&algorithm={key.algorithm}&digits={key.digits}&period={key.period}"
    )
