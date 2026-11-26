"""Meminta model menulis jawaban terstruktur (JSON): Gemini, atau tiruan lokal untuk pengujian."""

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from google.genai import errors, types

from app.core.config import settings
from app.services.llm.gemini_keys import GeminiUnavailable, KeyPool


class ModelUnavailable(RuntimeError):
    """Model tidak bisa dipakai sekarang; layak dicoba dengan model cadangan."""


class ModelFailed(RuntimeError):
    """Permintaan ditolak atau jawabannya tidak bisa dibaca."""

    def __init__(self, message: str, input_tokens: int = 0, output_tokens: int = 0):
        super().__init__(message)
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


@dataclass
class Generation:
    data: dict
    input_tokens: int
    # Termasuk token berpikir, sesuai cara Google menagih
    output_tokens: int


class LlmProvider(Protocol):
    name: str

    async def generate(self, model: str, system: str, user: str, schema: dict) -> Generation: ...


class GeminiLlm:
    name = "gemini"

    def __init__(self, pool: KeyPool | None = None):
        self._pool = pool

    async def generate(self, model: str, system: str, user: str, schema: dict) -> Generation:
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
        )

        async def call(client):
            return await client.aio.models.generate_content(
                model=model, contents=user, config=config
            )

        try:
            if self._pool is None:
                self._pool = KeyPool.configured()
            response = await self._pool.run(model, call, settings.GENERATION_TIMEOUT_SECONDS)
        except GeminiUnavailable as exc:
            raise ModelUnavailable(str(exc)) from exc
        except errors.APIError as exc:
            # Model yang dihentikan Google dijawab 404; cadangan masih bisa dipakai
            if exc.code == 404:
                raise ModelUnavailable(f"Model {model} tidak tersedia.") from exc
            raise ModelFailed(f"Model menolak permintaan ({exc.code}).") from exc

        usage = response.usage_metadata
        input_tokens = (usage.prompt_token_count or 0) if usage else 0
        output_tokens = (
            (usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0) if usage else 0
        )
        try:
            data = json.loads(response.text or "")
            if not isinstance(data, dict):
                raise ValueError
        except ValueError:
            raise ModelFailed(
                "Jawaban model tidak bisa dibaca.", input_tokens, output_tokens
            ) from None
        return Generation(data, input_tokens, output_tokens)


class MockLlm:
    """Menyebut potongan pertama sebagai dasar jawaban; jumlah token ditaksir dari panjang."""

    name = "mock"

    async def generate(self, model: str, system: str, user: str, schema: dict) -> Generation:
        numbers = [int(n) for n in re.findall(r'<dokumen nomor="(\d+)"', user)]
        data = {
            "status": "done" if numbers else "not_in_documents",
            "output": f"Hasil tiruan berdasarkan aturan [{numbers[0]}]." if numbers else "",
            "sources": numbers[:1],
            "notes": "Dijawab penyedia tiruan.",
        }
        return Generation(data, len(system + user) // 4, 120)


@lru_cache
def get_llm_provider() -> LlmProvider:
    return MockLlm() if settings.LLM_PROVIDER == "mock" else GeminiLlm()
