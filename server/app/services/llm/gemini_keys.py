"""
Rotasi kunci API Gemini.

Diadaptasi dari `TotO-L-py/backend/app/ai/gemini_keys.py`: kunci yang kena batas permintaan
diistirahatkan dan permintaan pindah ke kunci berikutnya. Log hanya menyebut nomor urut
kunci, tidak pernah isinya.
"""

import asyncio
import logging
import os
import re
from collections.abc import Awaitable, Callable
from time import monotonic
from typing import Any

from dotenv import dotenv_values
from google import genai
from google.genai import errors, types

from app.core.config import settings

logger = logging.getLogger("mbuti.gemini")

REJECTED_COOLDOWN_SECONDS = 600


class GeminiUnavailable(RuntimeError):
    """Tidak ada kunci yang bisa dipakai saat ini; coba lagi setelah `retry_after` detik."""

    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.retry_after = retry_after


def configured_keys() -> list[str]:
    """Kunci utama lalu cadangan menurut nomornya, dari `server/.env` dan variabel lingkungan."""
    values = dict(dotenv_values(settings.model_config["env_file"]))
    values.update(os.environ)
    numbered = sorted(
        (int(match[1]), value)
        for name, value in values.items()
        if (match := re.fullmatch(r"GEMINI_API_KEY(\d+)", name)) and value
    )
    keys = [settings.GEMINI_API_KEY.get_secret_value(), *(value for _, value in numbered)]
    return list(dict.fromkeys(key.strip() for key in keys if key and key.strip()))


def _rejected(exc: errors.APIError) -> bool:
    if exc.code in (401, 403):
        return True
    return exc.code == 400 and "API key" in str(getattr(exc, "message", ""))


class KeyPool:
    def __init__(self, keys: list[str]):
        if not keys:
            raise GeminiUnavailable("Kunci API Gemini belum diisi di server.", 600)
        self._keys = keys
        self._resting: dict[int, float] = {}
        self._cursor = 0

    def _client(self, index: int) -> genai.Client:
        # Dibuat per panggilan: klien terikat pada event loop, sedangkan worker memakai loop baru
        return genai.Client(
            api_key=self._keys[index],
            # Percobaan ulang diatur di sini, bukan oleh SDK
            http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1)),
        )

    async def run(self, operation: Callable[[genai.Client], Awaitable[Any]]) -> Any:
        """Coba tiap kunci yang tidak sedang istirahat, mulai setelah yang terakhir berhasil."""
        count = len(self._keys)
        for offset in range(count):
            index = (self._cursor + offset) % count
            if self._resting.get(index, 0) > monotonic():
                continue
            try:
                result = await asyncio.wait_for(
                    operation(self._client(index)), timeout=settings.GEMINI_TIMEOUT_SECONDS
                )
            except TimeoutError:
                self._rest(index, settings.GEMINI_KEY_COOLDOWN_SECONDS, "waktu habis")
            except errors.APIError as exc:
                if _rejected(exc):
                    self._rest(index, REJECTED_COOLDOWN_SECONDS, f"ditolak ({exc.code})")
                elif exc.code == 429 or exc.code >= 500:
                    self._rest(index, settings.GEMINI_KEY_COOLDOWN_SECONDS, f"galat {exc.code}")
                else:
                    raise
            else:
                self._cursor = (index + 1) % count
                return result
        wait = min(self._resting.values(), default=monotonic()) - monotonic()
        raise GeminiUnavailable("Semua kunci Gemini sedang tidak bisa dipakai.", max(5, int(wait)))

    def _rest(self, index: int, seconds: int, reason: str) -> None:
        self._resting[index] = monotonic() + seconds
        logger.warning(
            "Kunci Gemini ke-%s dari %s diistirahatkan %s detik: %s",
            index + 1,
            len(self._keys),
            seconds,
            reason,
        )
