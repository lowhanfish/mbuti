"""
Kode unik tiap permintaan, dipakai di log, di jawaban galat, dan di jejak audit.

Pengguna yang melihat galat bisa menyebut kodenya, lalu pengelola mencarinya di log.
"""

import logging
import re
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

HEADER = b"x-request-id"
# Kode kiriman Nginx dipakai bila bentuknya wajar; selain itu dibuat sendiri
_ACCEPTED = re.compile(r"^[A-Za-z0-9-]{8,36}$")

current_request_id: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = current_request_id.get()
        return True


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope["headers"]).get(HEADER, b"").decode("latin-1")
        request_id = incoming if _ACCEPTED.match(incoming) else uuid.uuid4().hex[:12]
        token = current_request_id.set(request_id)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), (HEADER, request_id.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            current_request_id.reset(token)
