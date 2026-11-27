"""Meminta model menulis jawaban terstruktur (JSON): Gemini, atau tiruan lokal untuk pengujian."""

import json
import re
from collections.abc import Sequence
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

    async def generate(
        self,
        model: str,
        system: str,
        user: str,
        schema: dict,
        images: Sequence[tuple[str, bytes]] = (),
    ) -> Generation: ...


class GeminiLlm:
    name = "gemini"

    def __init__(self, pool: KeyPool | None = None):
        self._pool = pool

    async def generate(
        self,
        model: str,
        system: str,
        user: str,
        schema: dict,
        images: Sequence[tuple[str, bytes]] = (),
    ) -> Generation:
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
        )
        contents: object = user
        if images:
            # Gambar WebP dikirim bersama teks; resolusi sedang agar hemat token (kontrak 16.6)
            config.media_resolution = types.MediaResolution.MEDIA_RESOLUTION_MEDIUM
            contents = [
                user,
                *(
                    part
                    for label, data in images
                    for part in (
                        types.Part.from_text(text=f"Gambar {label}:"),
                        types.Part.from_bytes(data=data, mime_type="image/webp"),
                    )
                ),
            ]

        async def call(client):
            return await client.aio.models.generate_content(
                model=model, contents=contents, config=config
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

    async def generate(
        self,
        model: str,
        system: str,
        user: str,
        schema: dict,
        images: Sequence[tuple[str, bytes]] = (),
    ) -> Generation:
        if "skills" in schema.get("properties", {}):
            return Generation(_mock_formation(user), len(system + user) // 4, 600)
        numbers = [int(n) for n in re.findall(r'<dokumen nomor="(\d+)"', user)]
        data = {
            "status": "done" if numbers else "not_in_documents",
            "output": f"Hasil tiruan berdasarkan aturan [{numbers[0]}]." if numbers else "",
            "sources": numbers[:1],
            "notes": "Dijawab penyedia tiruan.",
        }
        if images:
            # Satu temuan per gambar, merujuk potongan pertama bila ada
            data["status"] = "done"
            data["output"] = data["output"] or "Hasil tiruan dari gambar."
            data["findings"] = [
                {
                    "image": label,
                    "title": f"Temuan tiruan pada {label}",
                    "description": "Bagian ini belum sesuai pedoman.",
                    "severity": "perlu_perbaikan",
                    "box": [100, 100, 400, 900],
                    "source": numbers[0] if numbers else None,
                    "recommendation": "Perbaiki sesuai pedoman.",
                    "criterion": "",
                }
                for label, _ in images
            ]
            data["page_readings"] = [
                {"image": label, "text": f"Bacaan tiruan {label}."} for label, _ in images
            ]
        return Generation(data, len(system + user) // 4 + 300 * len(images), 120)


_DUTY = re.compile(
    r"\b(menyusun|membuat|memeriksa|mengisi|merekap|melaporkan|menjawab|mendesain|merancang|"
    r"mencatat|menyiapkan|mengelola|memverifikasi)\b",
    re.IGNORECASE,
)


def _mock_formation(user: str) -> dict:
    """Pembentukan role tiruan: keterampilan dari kalimat berkata kerja, satu putaran pertanyaan."""
    duties = []
    for line in re.split(r"\n|(?<=\.)\s+", user):
        line = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line).strip().rstrip(".")
        if 12 <= len(line) <= 200 and _DUTY.search(line) and ":" not in line[:25]:
            if line not in duties:
                duties.append(line)
    duties = duties[:5] or ["Mengerjakan tugas utama sesuai arahan"]
    tools_line = re.search(r"Alat dan kemampuan yang ditulis pembuat: (.*)", user)
    tools = (
        []
        if not tools_line or "(tidak ada)" in tools_line.group(1)
        else [t.strip() for t in tools_line.group(1).split(",") if t.strip()]
    )
    answering = "<jawaban>" in user
    skills = [
        {
            "name": " ".join(duty.split()[:5]),
            "description": duty,
            "steps": [
                {"text": "Periksa bahan dan arahan", "approval": False},
                {"text": "Susun hasil sesuai aturan organisasi", "approval": False},
                {"text": "Serahkan ke penanggung jawab", "approval": True},
            ],
            "inputs": ["Arahan tugas"],
            "outputs": ["Hasil kerja"],
            "tools": tools if index == 0 else [],
        }
        for index, duty in enumerate(duties)
    ]
    questions = (
        []
        if answering
        else [
            {
                "text": "Hasil pekerjaan utama dikirim ke siapa, dan formatnya seperti apa?",
                "required": True,
            },
            {"text": "Ada contoh hasil yang dianggap bagus?", "required": False},
        ]
    )
    objections = (
        ["Saya keberatan mengirim hasil tanpa persetujuan penanggung jawab."]
        if not answering and "langsung kirim" in user.lower()
        else []
    )
    return {
        "summary": f"Ditemukan {len(skills)} keterampilan dari bahan.",
        "goal": "Mengerjakan tugas sesuai uraian jabatan dengan hasil yang siap disetujui.",
        "skills": skills,
        "findings": [{"kind": "unclear", "text": "Tenggat pekerjaan belum disebut.", "ref": ""}],
        "questions": questions,
        "objections": objections,
        "work": {
            "instructions": "\n".join(f"{i}. {s['name']}" for i, s in enumerate(skills, 1)),
            "inputs": [{"label": "Arahan tugas", "type": "long_text", "required": True}],
            "output_format": "text",
            "output_template": "",
            "acceptance_criteria": ["Hasil sesuai aturan organisasi"],
        },
        "satisfied": answering,
        "note": "Rancangan sudah jelas." if answering else "",
    }


@lru_cache
def get_llm_provider() -> LlmProvider:
    return MockLlm() if settings.LLM_PROVIDER == "mock" else GeminiLlm()
