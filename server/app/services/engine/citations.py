"""
Rujukan dibuat server dari nomor potongan, bukan ditulis model.

Nomor yang tidak pernah diberikan dibuang, lalu nomor di teks disusun ulang agar `[1]`
menunjuk rujukan pertama yang tampil di layar.
"""

import re

from app.services.knowledge.search import Chunk

REFERENCE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")


def apply_citations(
    output: str, sources: list[object], excerpts: list[Chunk]
) -> tuple[str, list[Chunk]]:
    """Kembalikan (teks dengan nomor baru, potongan yang dirujuk menurut urutan nomor)."""
    listed = [n for n in sources if isinstance(n, int)]
    mentioned = [int(n) for group in REFERENCE.findall(output) for n in group.split(",")]
    order: list[int] = []
    for number in [*mentioned, *listed]:
        if 1 <= number <= len(excerpts) and number not in order:
            order.append(number)
    position = {number: index for index, number in enumerate(order, start=1)}

    def renumber(match: re.Match) -> str:
        found = [position[int(n)] for n in match[1].split(",") if int(n) in position]
        return "".join(f"[{n}]" for n in found)

    return REFERENCE.sub(renumber, output), [excerpts[n - 1] for n in order]
