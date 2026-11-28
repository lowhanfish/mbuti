"""Brankas akun per role (kontrak API bagian 21.3)."""

import datetime
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, field_validator

from app.api.v1.common import RequestModel
from app.services.vault.addresses import MAX_URL

MAX_ACCOUNTS = 20
MAX_OTHER_URLS = 5
MAX_PASSWORD = 500

Blocker = Literal["", "viewer", "no_responsible", "not_responsible", "two_factor_off"]


class CodeBody(RequestModel):
    code: str = Field(default="", max_length=20)


class VaultInput(CodeBody):
    """Spasi pada password dipertahankan; kolom lain dipangkas di validatornya."""

    model_config = {"str_strip_whitespace": False}

    name: str
    url: str
    other_urls: list[str] = Field(default_factory=list)
    username: str
    # SecretStr agar tidak tercetak bila isiannya ikut ditulis ke log
    password: SecretStr = SecretStr("")
    totp_key: SecretStr = SecretStr("")
    remove_totp: bool = False

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = value.strip()
        if not 2 <= len(value) <= 80:
            raise ValueError("Nama aplikasi 2 sampai 80 karakter.")
        return value

    @field_validator("url")
    @classmethod
    def strip_url(cls, value: str) -> str:
        return value.strip()

    @field_validator("other_urls")
    @classmethod
    def check_other_urls(cls, value: list[str]) -> list[str]:
        urls = [u.strip() for u in value if u.strip()]
        if len(urls) > MAX_OTHER_URLS:
            raise ValueError(f"Alamat lain maksimal {MAX_OTHER_URLS}.")
        if any(len(u) > MAX_URL for u in urls):
            raise ValueError(f"Alamat maksimal {MAX_URL} karakter.")
        return urls

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 200:
            raise ValueError("Username wajib diisi, maksimal 200 karakter.")
        return value

    @field_validator("password")
    @classmethod
    def check_password(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) > MAX_PASSWORD:
            raise ValueError(f"Password maksimal {MAX_PASSWORD} karakter.")
        return value

    @field_validator("totp_key")
    @classmethod
    def check_totp_key(cls, value: SecretStr) -> SecretStr:
        text = value.get_secret_value().strip()
        if len(text) > MAX_URL:
            raise ValueError(f"Kunci authenticator maksimal {MAX_URL} karakter.")
        return SecretStr(text)


class VaultAccountItem(BaseModel):
    id: str
    name: str
    url: str
    other_urls: list[str]
    username: str
    has_password: bool
    has_totp: bool
    locked: bool
    login_failed: bool
    password_changed_at: datetime.datetime
    last_used_at: datetime.datetime | None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class VaultAccess(BaseModel):
    can_manage: bool
    blocker: Blocker
    responsible_name: str | None


class VaultData(BaseModel):
    accounts: list[VaultAccountItem]
    access: VaultAccess


class VaultCode(BaseModel):
    code: str
    expires_in: int
    period: int
