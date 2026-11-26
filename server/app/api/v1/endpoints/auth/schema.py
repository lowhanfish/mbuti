"""Bentuk data auth, sama dengan `types/global.ts` di frontend."""

import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.api.v1.common import EMAIL_PATTERN, RequestModel
from app.api.v1.endpoints.admin.organisasi.schema import Sector
from app.core.security import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH


class LoginRequest(RequestModel):
    # Tidak divalidasi bentuknya: email salah bentuk dijawab sama dengan akun tak dikenal
    email: str = Field(max_length=150)
    # Spasi pada kata sandi dipertahankan
    password: str = Field(max_length=200, json_schema_extra={"format": "password"})

    model_config = {"str_strip_whitespace": False}


class OrganizationSummary(BaseModel):
    id: str
    name: str
    slug: str
    # pending: menunggu persetujuan pengelola; suspended: ditangguhkan
    status: Literal["pending", "active", "suspended"]


class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    is_active: bool
    is_verified: bool
    access_role: str | None
    organization: OrganizationSummary | None
    created_at: datetime.datetime


class AuthData(BaseModel):
    user: UserProfile
    csrf_token: str | None = None


# ==========================
# AKUN MANDIRI (kontrak API bagian 15)
# ==========================


def _password(value: str) -> str:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Kata sandi minimal {PASSWORD_MIN_LENGTH} karakter.")
    if len(value) > PASSWORD_MAX_LENGTH:
        raise ValueError(f"Kata sandi maksimal {PASSWORD_MAX_LENGTH} karakter.")
    return value


def _name(value: str, label: str = "Nama") -> str:
    value = value.strip()
    if len(value) < 2:
        raise ValueError(f"{label} minimal 2 karakter.")
    if len(value) > 150:
        raise ValueError(f"{label} maksimal 150 karakter.")
    return value


class AuthOptions(BaseModel):
    registration: Literal["closed", "approval", "open"]
    password_min_length: int


class PasswordModel(RequestModel):
    """Spasi pada kata sandi dipertahankan; kolom teks lain dipangkas di validatornya."""

    model_config = {"str_strip_whitespace": False}

    password: str = Field(json_schema_extra={"format": "password"})

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return _password(value)


class RegisterRequest(PasswordModel):
    full_name: str
    email: str
    organization_name: str
    sector: Sector
    accept_terms: bool

    @field_validator("full_name")
    @classmethod
    def check_name(cls, value: str) -> str:
        return _name(value)

    @field_validator("organization_name")
    @classmethod
    def check_organization(cls, value: str) -> str:
        return _name(value, "Nama organisasi")

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        value = value.strip().lower()
        if len(value) > 150 or not EMAIL_PATTERN.match(value):
            raise ValueError("Format email tidak valid.")
        return value

    @field_validator("accept_terms")
    @classmethod
    def check_terms(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Setujui ketentuan layanan dan kebijakan privasi untuk mendaftar.")
        return value


class TokenRequest(RequestModel):
    token: str = Field(max_length=200)


class EmailRequest(RequestModel):
    # Bentuknya tidak divalidasi: jawabannya sama untuk email apa pun
    email: str = Field(max_length=150)


class ResetPasswordRequest(PasswordModel):
    token: str = Field(max_length=200)

    @field_validator("token")
    @classmethod
    def strip_token(cls, value: str) -> str:
        return value.strip()


class AcceptInviteRequest(PasswordModel):
    token: str = Field(max_length=200)
    full_name: str

    @field_validator("token")
    @classmethod
    def strip_token(cls, value: str) -> str:
        return value.strip()

    @field_validator("full_name")
    @classmethod
    def check_name(cls, value: str) -> str:
        return _name(value)


class InvitePreview(BaseModel):
    email: str
    full_name: str
    organization_name: str
    inviter_name: str
    access_role: str
    expires_at: datetime.datetime
