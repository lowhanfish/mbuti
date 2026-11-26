"""Tolak kiriman yang terlalu besar sebelum dibaca."""

from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import settings
from app.core.exceptions import error_response

# Ruang untuk kolom formulir di samping berkas
FORM_OVERHEAD_BYTES = 1024 * 1024


class BodySizeLimitMiddleware:
    """Berdasarkan `Content-Length`; di produksi Nginx juga membatasi ukuran kiriman."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            length = dict(scope["headers"]).get(b"content-length", b"0")
            limit = settings.MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES
            if not length.isdigit() or int(length) > limit:
                response = error_response(413, "Ukuran kiriman terlalu besar.")
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
