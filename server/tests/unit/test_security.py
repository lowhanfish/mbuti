"""Hash kata sandi, token akses, dan pengaturan sesi."""

import datetime
import uuid
from pathlib import Path

import jwt
import pytest
from pydantic import ValidationError

from app.core import security
from app.core.config import Settings, settings


async def test_password_roundtrip():
    stored = security.hash_password("kata-sandi-panjang")

    assert stored.startswith("$argon2id$")
    assert await security.verify_password("kata-sandi-panjang", stored)
    assert not await security.verify_password("salah", stored)
    assert not await security.verify_password("apa-saja", None)
    assert not await security.verify_password("apa-saja", "bukan-hash")


def test_access_token_roundtrip():
    user, family = uuid.uuid4(), uuid.uuid4()

    assert security.read_access_token(security.create_access_token(user, family)) == (user, family)


@pytest.mark.parametrize(
    ("key", "expires", "issuer"),
    [
        (None, -1, "mbuti"),
        ("kunci-lain-yang-cukup-panjang-untuk-hs256", 5, "mbuti"),
        (None, 5, "aplikasi-lain"),
    ],
)
def test_invalid_tokens_are_refused(key, expires, issuer):
    payload = {
        "sub": str(uuid.uuid4()),
        "sid": str(uuid.uuid4()),
        "iss": issuer,
        "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=expires),
    }
    token = jwt.encode(
        payload, key or settings.JWT_SECRET_KEY.get_secret_value(), algorithm="HS256"
    )

    assert security.read_access_token(token) is None


def load(tmp_path: Path, content: str, monkeypatch: pytest.MonkeyPatch) -> Settings:
    for name in Settings.model_fields:
        monkeypatch.delenv(name, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(content, encoding="utf-8")
    return Settings(_env_file=env_file)


# 32 byte nol dalam base64, hanya untuk memeriksa validasi pengaturan
KEY = "A" * 43 + "="


def test_development_generates_a_secret(tmp_path, monkeypatch):
    value = load(tmp_path, "", monkeypatch).JWT_SECRET_KEY.get_secret_value()

    assert len(value) >= 32


@pytest.mark.parametrize(
    "content",
    [
        f"APP_ENV=production\nCOOKIE_SECURE=true\nVAULT_KEY={KEY}\n",
        f"APP_ENV=production\nCOOKIE_SECURE=true\nVAULT_KEY={KEY}\nJWT_SECRET_KEY=pendek\n",
        f"APP_ENV=production\nVAULT_KEY={KEY}\nJWT_SECRET_KEY={'x' * 40}\n",
        f"APP_ENV=production\nCOOKIE_SECURE=true\nJWT_SECRET_KEY={'x' * 40}\n",
        f"APP_ENV=production\nCOOKIE_SECURE=true\nJWT_SECRET_KEY={'x' * 40}\nVAULT_KEY=pendek\n",
    ],
)
def test_production_requires_secret_and_secure_cookies(tmp_path, monkeypatch, content):
    with pytest.raises(ValidationError):
        load(tmp_path, content, monkeypatch)
