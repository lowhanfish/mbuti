"""Perlindungan CSRF: header `X-CSRF-Token` harus sama dengan cookie, dan asal dikenal."""

import hmac

from fastapi import Request

from app.core.config import settings
from app.core.cookies import CSRF_COOKIE
from app.core.exceptions import ForbiddenException

CSRF_HEADER = "X-CSRF-Token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


def check_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in settings.ALLOWED_ORIGINS:
        raise ForbiddenException("Asal permintaan tidak diizinkan.")


def verify_csrf(request: Request) -> None:
    if request.method in SAFE_METHODS:
        return
    check_origin(request)
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get(CSRF_HEADER)
    if not cookie or not header or not hmac.compare_digest(cookie.encode(), header.encode()):
        raise ForbiddenException("Token keamanan tidak cocok. Muat ulang halaman lalu coba lagi.")
