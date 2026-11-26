"""
Warna unit dan avatar bawaan role.

Nilainya harus sama dengan frontend (`organisasi/unit/types.ts` dan `agent/avatar-config.ts`).
"""

UNIT_COLOR_HEX = {
    "violet": "#7c4dff",
    "honey": "#ffb81c",
    "pink": "#ec4899",
    "teal": "#14b8a6",
    "sky": "#0ea5e9",
    "lime": "#84cc16",
    "orange": "#f97316",
    "slate": "#64748b",
}

SKIN_TONES = ("#f6d5b8", "#eebd94", "#d9a074", "#b97a4f", "#8d5a37", "#5e3a22")
HAIR_COLORS = ("#1f1a24", "#4a2e1f", "#8a5a2b", "#d9a441", "#c2410c", "#6d28d9")
SHIRT_COLORS = (
    "#7c4dff",
    "#ffb81c",
    "#18122b",
    "#ec4899",
    "#14b8a6",
    "#0ea5e9",
    "#f97316",
    "#84cc16",
)
PANTS_COLORS = ("#18122b", "#334155", "#1e3a8a", "#3f3f46")
HAIR_STYLES = ("short", "long", "bun", "cap", "short")
ACCESSORIES = ("none", "glasses", "headset", "tie", "flower", "antenna")


def avatar_from_seed(seed: str) -> dict[str, str]:
    """Avatar acak yang tetap untuk nama yang sama (padanan `avatarFromSeed`)."""
    value = 0
    # Sama dengan `charCodeAt(0)` per karakter: di luar BMP yang dipakai paruh pertama UTF-16
    for char in seed:
        code = ord(char)
        if code > 0xFFFF:
            code = 0xD800 + ((code - 0x10000) >> 10)
        value = (value * 31 + code) & 0xFFFFFFFF

    def pick(items: tuple[str, ...], shift: int) -> str:
        return items[(value >> shift) % len(items)]

    return {
        "skin": pick(SKIN_TONES, 1),
        "hair": pick(HAIR_COLORS, 4),
        "hair_style": pick(HAIR_STYLES, 7),
        "shirt": pick(SHIRT_COLORS, 10),
        "pants": pick(PANTS_COLORS, 13),
        "accessory": pick(ACCESSORIES, 16),
    }
