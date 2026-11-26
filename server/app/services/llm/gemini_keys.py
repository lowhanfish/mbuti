"""
Rotasi kunci API Gemini.

Diadaptasi dari `TotO-L-py/backend/app/ai/gemini_keys.py`: kunci yang kena batas permintaan
diistirahatkan per model dan permintaan pindah ke kunci berikutnya. Log dan status hanya
menyebut nama variabel atau nomor urut kunci, tidak pernah isinya.
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
from app.services.llm import key_status

logger = logging.getLogger("mbuti.gemini")

REJECTED_COOLDOWN_SECONDS = 600
# Waktu habis biasanya menandakan model sedang sibuk, bukan kuncinya; jangan coba semua kunci
MAX_TIMEOUTS_PER_CALL = 2


class GeminiUnavailable(RuntimeError):
    """Tidak ada kunci yang bisa dipakai saat ini; coba lagi setelah `retry_after` detik."""

    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.retry_after = retry_after


def key_slots() -> list[tuple[str, str]]:
    """(nama variabel, kunci): kunci utama lalu cadangan menurut nomornya, tanpa duplikat."""
    values = dict(dotenv_values(settings.model_config["env_file"]))
    values.update(os.environ)
    numbered = sorted(
        (int(match[1]), name, value)
        for name, value in values.items()
        if (match := re.fullmatch(r"GEMINI_API_KEY(\d+)", name)) and value
    )
    candidates = [
        ("GEMINI_API_KEY", settings.GEMINI_API_KEY.get_secret_value()),
        *((name, value) for _, name, value in numbered),
    ]
    slots: dict[str, str] = {}
    for name, value in candidates:
        key = (value or "").strip()
        if key and key not in slots:
            slots[key] = name
    return [(name, key) for key, name in slots.items()]


def configured_keys() -> list[str]:
    return [key for _, key in key_slots()]


def _rejected(exc: errors.APIError) -> bool:
    if exc.code in (401, 403):
        return True
    return exc.code == 400 and "API key" in str(getattr(exc, "message", ""))


class KeyPool:
    def __init__(self, keys: list[str], names: list[str] | None = None):
        if not keys:
            raise GeminiUnavailable("Kunci API Gemini belum diisi di server.", 600)
        self._keys = keys
        self._names = names
        # Kena batas atau galat sementara: per (kunci, model)
        self._resting: dict[tuple[int, str], float] = {}
        # Ditolak: kuncinya sendiri bermasalah, jadi berlaku untuk semua model
        self._rejected: dict[int, float] = {}
        self._cursor = 0

    @classmethod
    def configured(cls) -> "KeyPool":
        slots = key_slots()
        return cls([key for _, key in slots], [name for name, _ in slots])

    def _client(self, index: int) -> genai.Client:
        # Dibuat per panggilan: klien terikat pada event loop, sedangkan worker memakai loop baru
        return genai.Client(
            api_key=self._keys[index],
            # Percobaan ulang diatur di sini, bukan oleh SDK
            http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1)),
        )

    def _available(self, index: int, model: str) -> bool:
        now = monotonic()
        return self._rejected.get(index, 0) <= now and self._resting.get((index, model), 0) <= now

    async def run(
        self,
        model: str,
        operation: Callable[[genai.Client], Awaitable[Any]],
        timeout: float | None = None,
    ) -> Any:
        """Coba tiap kunci yang tidak sedang istirahat, mulai setelah yang terakhir berhasil."""
        count = len(self._keys)
        timeouts = 0
        for offset in range(count):
            index = (self._cursor + offset) % count
            if not self._available(index, model):
                continue
            try:
                result = await asyncio.wait_for(
                    operation(self._client(index)),
                    timeout=timeout or settings.GEMINI_TIMEOUT_SECONDS,
                )
            except TimeoutError:
                timeouts += 1
                await self._rest(index, model, settings.GEMINI_KEY_COOLDOWN_SECONDS, "waktu habis")
                if timeouts >= MAX_TIMEOUTS_PER_CALL:
                    break
            except errors.APIError as exc:
                if _rejected(exc):
                    await self._reject(index, exc.code)
                elif exc.code == 429 or exc.code >= 500:
                    await self._rest(
                        index, model, settings.GEMINI_KEY_COOLDOWN_SECONDS, f"galat {exc.code}"
                    )
                else:
                    raise
            else:
                self._cursor = (index + 1) % count
                await key_status.record_use(self._name(index))
                return result
        now = monotonic()
        waits = [until - now for (_, m), until in self._resting.items() if m == model]
        raise GeminiUnavailable(
            "Model Gemini sedang tidak bisa dipakai.", max(5, int(min(waits, default=60)))
        )

    def _name(self, index: int) -> str | None:
        return self._names[index] if self._names else None

    async def _rest(self, index: int, model: str, seconds: int, reason: str) -> None:
        self._resting[(index, model)] = monotonic() + seconds
        logger.warning(
            "Kunci Gemini ke-%s dari %s diistirahatkan %s detik untuk %s: %s",
            index + 1,
            len(self._keys),
            seconds,
            model,
            reason,
        )
        await key_status.record_cooldown(self._name(index), seconds)

    async def _reject(self, index: int, code: int) -> None:
        self._rejected[index] = monotonic() + REJECTED_COOLDOWN_SECONDS
        logger.warning("Kunci Gemini ke-%s ditolak (%s)", index + 1, code)
        await key_status.record_rejected(self._name(index), REJECTED_COOLDOWN_SECONDS)
