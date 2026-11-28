"""Nomor surat dari buku register (kontrak 18.2). Model tidak pernah mengarang nomor."""

import datetime

ROMAN = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII")


def format_number(pattern: str, sequence: int, day: datetime.date) -> str:
    return (
        pattern.replace("[urut]", f"{sequence:03d}")
        .replace("[bulan]", ROMAN[day.month - 1])
        .replace("[tahun]", str(day.year))
    )
