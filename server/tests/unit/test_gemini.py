"""Rotasi kunci dan vektor tiruan, tanpa memanggil Google."""

import pytest
from google.genai import errors

from app.services.llm import gemini_keys
from app.services.llm.embedding import MockEmbedding
from app.services.llm.gemini_keys import GeminiUnavailable, KeyPool


def api_error(code: int, message: str = "galat") -> errors.APIError:
    return errors.APIError(code, {"error": {"code": code, "message": message}})


def pool_with(monkeypatch, behaviour: dict[str, int | None]):
    """`behaviour` memetakan kunci ke kode galat; None berarti berhasil."""
    calls: list[str] = []
    pool = KeyPool(list(behaviour))
    monkeypatch.setattr(pool, "_client", lambda index: list(behaviour)[index])

    async def operation(key):
        calls.append(key)
        if behaviour[key]:
            raise api_error(behaviour[key])
        return key

    return pool, operation, calls


async def test_moves_to_next_key_and_rotates(monkeypatch):
    pool, operation, calls = pool_with(monkeypatch, {"a": 429, "b": None, "c": None})

    assert await pool.run("model", operation) == "b"
    assert await pool.run("model", operation) == "c"
    # Kunci yang kena batas tidak dicoba lagi selama istirahat
    assert await pool.run("model", operation) == "b"
    assert calls == ["a", "b", "c", "b"]


async def test_all_keys_resting(monkeypatch):
    pool, operation, calls = pool_with(monkeypatch, {"a": 429, "b": 403})

    with pytest.raises(GeminiUnavailable) as failure:
        await pool.run("model", operation)
    assert failure.value.retry_after >= 5
    with pytest.raises(GeminiUnavailable):
        await pool.run("model", operation)
    assert calls == ["a", "b"]


async def test_resting_is_per_model_but_rejection_is_not(monkeypatch):
    pool, operation, calls = pool_with(monkeypatch, {"a": 429, "b": 403})
    with pytest.raises(GeminiUnavailable):
        await pool.run("model", operation)
    calls.clear()
    with pytest.raises(GeminiUnavailable):
        await pool.run("model-lain", operation)
    # "a" dicoba lagi untuk model lain; "b" yang ditolak tidak
    assert calls == ["a"]


async def test_timeouts_stop_after_two_keys(monkeypatch):
    pool = KeyPool(["a", "b", "c"])
    monkeypatch.setattr(pool, "_client", lambda index: index)
    calls = []

    async def slow(index):
        calls.append(index)
        raise TimeoutError

    with pytest.raises(GeminiUnavailable):
        await pool.run("model", slow)
    assert calls == [0, 1]


async def test_other_errors_are_not_retried(monkeypatch):
    pool, operation, calls = pool_with(monkeypatch, {"a": 400, "b": None})

    with pytest.raises(errors.APIError):
        await pool.run("model", operation)
    assert calls == ["a"]


def test_keys_are_read_in_numeric_order(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("GEMINI_API_KEY2=dua\nGEMINI_API_KEY10=sepuluh\nGEMINI_API_KEY1=satu\n")
    monkeypatch.setitem(gemini_keys.settings.model_config, "env_file", env_file)
    for name in list(gemini_keys.os.environ):
        if name.startswith("GEMINI_API_KEY"):
            monkeypatch.delenv(name)
    monkeypatch.setattr(
        gemini_keys.settings, "GEMINI_API_KEY", gemini_keys.settings.GEMINI_API_KEY.__class__("")
    )

    assert gemini_keys.configured_keys() == ["satu", "dua", "sepuluh"]


def test_no_keys_is_reported():
    with pytest.raises(GeminiUnavailable):
        KeyPool([])


async def test_mock_embedding_places_similar_text_closer():
    provider = MockEmbedding()
    query = await provider.embed_query("syarat surat undangan")
    near = await provider.embed_document("", "surat undangan memuat syarat hari dan tempat")
    far = await provider.embed_document("", "laporan realisasi anggaran bulanan")

    def similarity(other):
        return sum(a * b for a, b in zip(query, other, strict=True))

    assert len(query) == 768
    assert similarity(near) > similarity(far)
