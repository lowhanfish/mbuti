"""Bentuk data auth, sama dengan `types/global.ts` di frontend."""

import datetime

from pydantic import BaseModel, Field

from app.api.v1.common import RequestModel


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
