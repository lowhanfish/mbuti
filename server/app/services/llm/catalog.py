"""
Model yang bisa dipilih beserta harganya.

Harga tier berbayar standar, dolar per 1 juta token (keluaran termasuk token berpikir), dari
https://ai.google.dev/gemini-api/docs/pricing dibaca 26 November 2026. Perbarui bila Google
mengubah harga. Biaya tetap dihitung pada tier gratis agar batas anggaran berfungsi.
Model yang akan dihentikan (gemini-2.5-flash dan 2.5-pro, mulai 1 Desember 2026) tidak disertakan.
"""

import datetime
import math
from dataclasses import dataclass

from app.core.config import settings

# Perkiraan ukuran satu langkah kerja untuk ditampilkan di pengaturan
TYPICAL_INPUT_TOKENS = 4000
# Termasuk token berpikir; draf surat contoh memakai sekitar 4.000
TYPICAL_OUTPUT_TOKENS = 2500


@dataclass(frozen=True)
class ModelInfo:
    id: str
    label: str
    hint: str
    # (berlaku mulai, harga masuk, harga keluar), urut tanggal
    prices: tuple[tuple[datetime.date, float, float], ...]

    def price(self, day: datetime.date) -> tuple[float, float]:
        current = self.prices[0]
        for entry in self.prices:
            if entry[0] <= day:
                current = entry
        return current[1], current[2]


_ALWAYS = datetime.date(2026, 1, 1)


def _model(model_id: str, label: str, hint: str, *prices) -> ModelInfo:
    return ModelInfo(model_id, label, hint, prices)


CATALOG: dict[str, ModelInfo] = {
    m.id: m
    for m in (
        _model(
            "gemini-2.5-flash-lite",
            "Gemini 2.5 Flash-Lite",
            "Termurah.",
            (_ALWAYS, 0.10, 0.40),
        ),
        _model(
            "gemini-3.1-flash-lite",
            "Gemini 3.1 Flash-Lite",
            "Hemat dan cepat.",
            (_ALWAYS, 0.25, 1.50),
        ),
        _model(
            "gemini-3.5-flash-lite",
            "Gemini 3.5 Flash-Lite",
            "Ringan, generasi lebih baru.",
            (_ALWAYS, 0.30, 2.50),
        ),
        _model(
            "gemini-3.6-flash",
            "Gemini 3.6 Flash",
            "Seimbang antara mutu dan biaya.",
            (_ALWAYS, 0.75, 3.75),
            (datetime.date(2027, 1, 1), 1.50, 7.50),
        ),
        _model(
            "gemini-3.8-flash",
            "Gemini 3.8 Flash",
            "Flash terbaru; tier gratis kadang lambat.",
            (_ALWAYS, 0.75, 3.75),
            (datetime.date(2027, 1, 1), 1.50, 7.50),
        ),
        _model(
            "gemini-4-hydrogen",
            "Gemini 4 Hydrogen",
            "Penalaran generasi 4.",
            (_ALWAYS, 1.50, 7.50),
        ),
        _model(
            "gemini-4-argon",
            "Gemini 4 Argon",
            "Penalaran mendalam; butuh tier berbayar.",
            (_ALWAYS, 2.00, 10.00),
            (datetime.date(2026, 12, 1), 4.00, 20.00),
        ),
        _model(
            "gemini-4-neon",
            "Gemini 4 Neon",
            "Pekerjaan pengetahuan yang rumit; butuh tier berbayar.",
            (_ALWAYS, 3.00, 15.00),
        ),
    )
}


def cost_in_rupiah(
    model_id: str, input_tokens: int, output_tokens: int, day: datetime.date | None = None
) -> int:
    """Dibulatkan ke atas. Model di luar katalog dihitung dengan harga tertinggi."""
    day = day or datetime.date.today()
    info = CATALOG.get(model_id)
    if info:
        price_in, price_out = info.price(day)
    else:
        price_in, price_out = max((m.price(day) for m in CATALOG.values()), key=lambda p: p[1])
    dollars = (input_tokens * price_in + output_tokens * price_out) / 1_000_000
    return math.ceil(round(dollars * settings.USD_IDR_RATE, 6))


def estimated_step_cost(model_id: str) -> int:
    return cost_in_rupiah(model_id, TYPICAL_INPUT_TOKENS, TYPICAL_OUTPUT_TOKENS)
