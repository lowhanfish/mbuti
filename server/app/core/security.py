"""Hash kata sandi (Argon2id), token akses (JWT), dan token acak."""

import asyncio
import datetime
import hashlib
import secrets
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error, InvalidHashError

from app.core.config import settings

JWT_ALGORITHM = "HS256"
JWT_ISSUER = "mbuti"
PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 128

_hasher = PasswordHasher()
# Dipakai saat email tidak dikenal, agar lama jawabannya sama dengan kata sandi salah.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def _verify(password: str, password_hash: str | None) -> bool:
    try:
        _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (Argon2Error, InvalidHashError):
        return False
    return password_hash is not None


async def verify_password(password: str, password_hash: str | None) -> bool:
    """Argon2 sengaja lambat, jadi dijalankan di thread terpisah."""
    return await asyncio.to_thread(_verify, password, password_hash)


def create_access_token(user_id: uuid.UUID, family_id: uuid.UUID) -> str:
    now = datetime.datetime.now(datetime.UTC)
    payload = {
        "sub": str(user_id),
        # Sesi asal; dicabut bersama sesinya
        "sid": str(family_id),
        "iat": now,
        "exp": now + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "iss": JWT_ISSUER,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY.get_secret_value(), algorithm=JWT_ALGORITHM)


def read_access_token(token: str) -> tuple[uuid.UUID, uuid.UUID] | None:
    """Kembalikan (user_id, family_id), atau None bila token tidak sah atau kedaluwarsa."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY.get_secret_value(),
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            options={"require": ["exp", "sub", "sid"]},
        )
        return uuid.UUID(payload["sub"]), uuid.UUID(payload["sid"])
    except (jwt.InvalidTokenError, ValueError, TypeError):
        return None


def random_token(size: int = 48) -> str:
    return secrets.token_urlsafe(size)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
