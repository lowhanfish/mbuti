"""Avatar bawaan harus sama dengan yang dihasilkan frontend (`avatarFromSeed`)."""

import pytest

from app.services.appearance import avatar_from_seed

# Nilai dihitung dengan fungsi JavaScript di frontend
EXPECTED = {
    "Rani": ("#5e3a22", "#1f1a24", "short", "#7c4dff", "#1e3a8a", "headset"),
    "Tegar": ("#b97a4f", "#1f1a24", "short", "#ec4899", "#334155", "glasses"),
    "Nama Yang Sangat Panjang Sekali": (
        "#d9a074",
        "#6d28d9",
        "cap",
        "#f97316",
        "#18122b",
        "headset",
    ),
    "Zoë 🐝": ("#b97a4f", "#4a2e1f", "short", "#ffb81c", "#18122b", "tie"),
}


@pytest.mark.parametrize("name", EXPECTED)
def test_matches_frontend(name):
    avatar = avatar_from_seed(name)

    keys = ("skin", "hair", "hair_style", "shirt", "pants", "accessory")
    assert tuple(avatar[key] for key in keys) == EXPECTED[name]
