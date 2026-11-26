"""
Galat aplikasi dan penangan terpusat.

Semua galat dijawab dengan bentuk kontrak API bagian 1.2:
`{"success": false, "statusCode": ..., "message": "..."}`.
`message` berbahasa Indonesia karena ditampilkan apa adanya kepada pengguna.
"""

import logging
from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.request_context import current_request_id

logger = logging.getLogger("mbuti.exceptions")

INTERNAL_ERROR_MESSAGE = "Terjadi kesalahan pada server. Coba lagi nanti."

# Pengganti pesan bawaan Starlette/FastAPI yang berbahasa Inggris.
HTTP_MESSAGES: dict[int, str] = {
    400: "Permintaan tidak dapat diproses.",
    401: "Anda belum masuk atau sesi sudah berakhir.",
    403: "Anda tidak memiliki hak akses untuk tindakan ini.",
    404: "Data atau alamat tidak ditemukan.",
    405: "Metode tidak diizinkan untuk alamat ini.",
    409: "Tindakan bentrok dengan keadaan data saat ini.",
    413: "Ukuran kiriman terlalu besar.",
    415: "Jenis isi kiriman tidak didukung.",
    422: "Isian tidak valid.",
    429: "Terlalu banyak permintaan. Coba lagi beberapa saat.",
    500: INTERNAL_ERROR_MESSAGE,
    503: "Layanan sedang tidak tersedia. Coba lagi beberapa saat.",
}

# Pesan per jenis galat Pydantic. `{field}` diisi nama kolom, sisanya dari konteks galat.
VALIDATION_MESSAGES: dict[str, str] = {
    "missing": "{field} wajib diisi.",
    "string_too_short": "{field} minimal {min_length} karakter.",
    "string_too_long": "{field} maksimal {max_length} karakter.",
    "too_short": "{field} minimal berisi {min_length} butir.",
    "too_long": "{field} maksimal berisi {max_length} butir.",
    "greater_than": "{field} harus lebih besar dari {gt}.",
    "greater_than_equal": "{field} minimal {ge}.",
    "less_than": "{field} harus lebih kecil dari {lt}.",
    "less_than_equal": "{field} maksimal {le}.",
    "string_type": "{field} harus berupa teks.",
    "int_type": "{field} harus berupa bilangan bulat.",
    "int_parsing": "{field} harus berupa bilangan bulat.",
    "int_from_float": "{field} harus berupa bilangan bulat.",
    "float_type": "{field} harus berupa angka.",
    "float_parsing": "{field} harus berupa angka.",
    "bool_type": "{field} harus berupa benar atau salah.",
    "bool_parsing": "{field} harus berupa benar atau salah.",
    "list_type": "{field} harus berupa daftar.",
    "literal_error": "{field} berisi pilihan yang tidak dikenal.",
    "enum": "{field} berisi pilihan yang tidak dikenal.",
    "extra_forbidden": "{field} tidak dikenal.",
}

_LOCATIONS = {"body", "query", "path", "header", "cookie"}


class AppException(Exception):
    """Induk galat aplikasi."""

    def __init__(
        self,
        message: str = INTERNAL_ERROR_MESSAGE,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
    ):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class BadRequestException(AppException):
    def __init__(self, message: str = HTTP_MESSAGES[400]):
        super().__init__(message, status.HTTP_400_BAD_REQUEST)


class UnauthorizedException(AppException):
    def __init__(self, message: str = HTTP_MESSAGES[401]):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class ForbiddenException(AppException):
    def __init__(self, message: str = HTTP_MESSAGES[403]):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


class NotFoundException(AppException):
    def __init__(self, message: str = "Data tidak ditemukan."):
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class ConflictException(AppException):
    def __init__(self, message: str = HTTP_MESSAGES[409]):
        super().__init__(message, status.HTTP_409_CONFLICT)


class UnprocessableEntityException(AppException):
    def __init__(self, message: str = HTTP_MESSAGES[422]):
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_CONTENT)


class RateLimitException(AppException):
    def __init__(self, message: str = HTTP_MESSAGES[429]):
        super().__init__(message, status.HTTP_429_TOO_MANY_REQUESTS)


def error_response(
    status_code: int, message: str, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    """Bungkus galat sesuai kontrak."""
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "statusCode": status_code, "message": message},
        headers=headers,
    )


def validation_message(errors: Sequence[Any]) -> str:
    """Ubah daftar galat Pydantic menjadi satu kalimat dari galat pertama."""
    if not errors:
        return HTTP_MESSAGES[422]

    error = errors[0]
    error_type = error.get("type", "")
    context = error.get("ctx") or {}

    if error_type == "json_invalid":
        return "Isi permintaan bukan JSON yang valid."

    # Pesan dari validator buatan sendiri (`raise ValueError("...")`) dipakai apa adanya.
    if error_type == "value_error" and context.get("error"):
        return str(context["error"])

    location = list(error.get("loc", ()))
    if location and location[0] in _LOCATIONS:
        location = location[1:]
    # Indeks daftar disertakan agar butir yang salah bisa dikenali, mis. "steps.0.name".
    field = ".".join(str(part) for part in location)
    label = f"Kolom '{field}'" if field else "Isi permintaan"

    template = VALIDATION_MESSAGES.get(error_type, "{field} tidak valid.")
    try:
        return template.format(**{**context, "field": label})
    except (KeyError, IndexError):
        return f"{label} tidak valid."


class UnhandledExceptionMiddleware:
    """
    Tangkap galat yang tidak tertangani di dalam lapisan CORS.

    Penangan `Exception` milik FastAPI berjalan di luar `CORSMiddleware`, sehingga jawaban 500
    tidak membawa header CORS dan peramban menyembunyikan pesannya dari frontend.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            logger.exception("Galat tidak tertangani pada %s %s", scope["method"], scope["path"])
            if response_started:
                raise
            code = current_request_id.get()
            message = INTERNAL_ERROR_MESSAGE
            if code != "-":
                message = f"{message} Kode galat: {code}."
            await error_response(500, message)(scope, receive, send)


def register_exception_handlers(app: FastAPI) -> None:
    """Pasang penangan agar semua galat berbentuk sama."""

    @app.exception_handler(AppException)
    async def app_exception_handler(_: Request, exc: AppException) -> JSONResponse:
        return error_response(exc.status_code, exc.message)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        try:
            default_phrase = HTTPStatus(exc.status_code).phrase
        except ValueError:
            default_phrase = None

        if isinstance(exc.detail, str) and exc.detail != default_phrase:
            message = exc.detail
        else:
            message = HTTP_MESSAGES.get(exc.status_code, "Permintaan gagal diproses.")
        return error_response(exc.status_code, message, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(422, validation_message(exc.errors()))
