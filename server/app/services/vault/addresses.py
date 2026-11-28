"""Alamat aplikasi di brankas. Program hanya mengisi rahasia pada asal yang terdaftar."""

from urllib.parse import urlsplit

from app.core.config import settings

MAX_URL = 500
DEFAULT_PORTS = {"http": 80, "https": 443}
BAD_ADDRESS = "{label} harus berupa alamat http:// atau https:// tanpa pengguna dan kata sandi."


def origin_of(value: str, label: str = "Alamat aplikasi") -> str:
    """
    `skema://host[:port]` dari satu alamat. Ditolak bila peramban dan server bisa membacanya
    berbeda (spasi, garis miring terbalik) atau memuat pengguna dan kata sandi.
    """
    problem = ValueError(BAD_ADDRESS.format(label=label))
    if (
        not value
        or len(value) > MAX_URL
        or "\\" in value
        or any(c.isspace() or not c.isprintable() for c in value)
    ):
        raise problem
    try:
        parts = urlsplit(value)
        port = parts.port
        host = parts.hostname
        if host and not host.isascii():
            # Peramban membandingkan nama bentuk punycode
            host = host.encode("idna").decode("ascii")
    except (ValueError, UnicodeError):
        raise problem from None
    scheme = parts.scheme.lower()
    if scheme not in DEFAULT_PORTS or not host or "@" in parts.netloc or "%" in host:
        raise problem
    if settings.APP_ENV == "production" and scheme != "https":
        raise ValueError(f"{label} harus memakai https://.")
    if ":" in host:
        host = f"[{host}]"
    suffix = "" if port in (None, DEFAULT_PORTS[scheme]) else f":{port}"
    return f"{scheme}://{host}{suffix}"
