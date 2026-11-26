"""/api/v1/auth: masuk, data diri, perpanjang sesi, dan keluar."""

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.auth import service
from app.api.v1.endpoints.auth.schema import AuthData, LoginRequest
from app.core.cookies import (
    ACCESS_COOKIE,
    CSRF_COOKIE,
    REFRESH_COOKIE,
    clear_session_cookies,
    set_session_cookies,
)
from app.core.csrf import check_origin, verify_csrf
from app.core.exceptions import UnauthorizedException
from app.core.security import random_token, read_access_token
from app.models import User

router = APIRouter(prefix="/auth", tags=["Auth"])


def client_info(request: Request) -> service.ClientInfo:
    return service.ClientInfo(
        ip=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.post("/login", response_model=ApiResponse[AuthData])
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[AuthData]:
    check_origin(request)
    issued = await service.login(session, body.email, body.password, client_info(request))
    csrf_token = random_token(32)
    set_session_cookies(response, issued.access_token, csrf_token, issued.refresh_token)
    profile = await service.build_profile(session, issued.user)
    return ApiResponse(
        message="Berhasil masuk.", data=AuthData(user=profile, csrf_token=csrf_token)
    )


@router.get("/me", response_model=ApiResponse[AuthData])
async def me(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)
) -> ApiResponse[AuthData]:
    return ApiResponse(data=AuthData(user=await service.build_profile(session, user)))


@router.post("/refresh", response_model=ApiResponse[None])
async def refresh(
    request: Request, response: Response, session: AsyncSession = Depends(get_db)
) -> ApiResponse[None]:
    refresh_token = request.cookies.get(REFRESH_COOKIE, "")
    # Tanpa cookie refresh tidak ada sesi sama sekali: jawab 401, bukan galat CSRF
    if not refresh_token:
        raise UnauthorizedException(service.SESSION_ENDED)
    verify_csrf(request)
    issued = await service.refresh(session, refresh_token, client_info(request))
    # Token CSRF dipertahankan agar permintaan yang sedang berjalan di tab lain tetap cocok
    set_session_cookies(
        response, issued.access_token, request.cookies[CSRF_COOKIE], issued.refresh_token
    )
    return ApiResponse(message="Sesi diperbarui.", data=None)


@router.post("/logout", response_model=ApiResponse[None])
async def logout(
    request: Request, response: Response, session: AsyncSession = Depends(get_db)
) -> ApiResponse[None]:
    """Tetap berhasil walau token akses sudah kedaluwarsa atau sesinya sudah tidak ada."""
    refresh_token = request.cookies.get(REFRESH_COOKIE, "")
    claims = read_access_token(request.cookies.get(ACCESS_COOKIE, ""))
    if refresh_token or claims:
        verify_csrf(request)
        await service.logout(session, refresh_token, claims[1] if claims else None)
    clear_session_cookies(response)
    return ApiResponse(message="Berhasil keluar.", data=None)
