"""/api/v1/auth: masuk, data diri, perpanjang sesi, keluar, dan akun mandiri (bagian 15)."""

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.auth import accounts, service
from app.api.v1.endpoints.auth.schema import (
    AcceptInviteRequest,
    AuthData,
    AuthOptions,
    EmailRequest,
    InvitePreview,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenRequest,
)
from app.core import rate_limit
from app.core.config import settings
from app.core.cookies import (
    ACCESS_COOKIE,
    CSRF_COOKIE,
    REFRESH_COOKIE,
    clear_session_cookies,
    set_session_cookies,
)
from app.core.csrf import check_origin, verify_csrf
from app.core.exceptions import UnauthorizedException
from app.core.security import PASSWORD_MIN_LENGTH, random_token, read_access_token
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
    return await _signed_in(session, response, issued, "Berhasil masuk.")


async def _signed_in(
    session: AsyncSession, response: Response, issued: service.IssuedSession, message: str
) -> ApiResponse[AuthData]:
    """Pasang cookie sesi baru dan kirim profil beserta token CSRF."""
    csrf_token = random_token(32)
    set_session_cookies(response, issued.access_token, csrf_token, issued.refresh_token)
    profile = await service.build_profile(session, issued.user)
    return ApiResponse(message=message, data=AuthData(user=profile, csrf_token=csrf_token))


# Token CSRF hanya dikirim saat masuk; di sini kolomnya ditiadakan, bukan diisi null
@router.get(
    "/me", response_model=ApiResponse[AuthData], response_model_exclude={"data": {"csrf_token"}}
)
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
    await rate_limit.check_rate(
        "refresh", client_info(request).ip, settings.RATE_REFRESH_PER_MINUTE
    )
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
        await service.logout(
            session, refresh_token, claims[1] if claims else None, client_info(request)
        )
    clear_session_cookies(response)
    return ApiResponse(message="Berhasil keluar.", data=None)


# ==========================
# AKUN MANDIRI (kontrak API bagian 15). Publik: tanpa sesi dan tanpa CSRF, Origin diperiksa.
# ==========================


@router.get("/options", response_model=ApiResponse[AuthOptions])
async def options() -> ApiResponse[AuthOptions]:
    return ApiResponse(
        data=AuthOptions(
            registration=settings.REGISTRATION_MODE, password_min_length=PASSWORD_MIN_LENGTH
        )
    )


@router.post("/register", response_model=ApiResponse[None], status_code=201)
async def register(
    body: RegisterRequest, request: Request, session: AsyncSession = Depends(get_db)
) -> ApiResponse[None]:
    check_origin(request)
    await accounts.register(session, body, client_info(request))
    return ApiResponse(statusCode=201, message=accounts.REGISTERED, data=None)


@router.post("/verify-email", response_model=ApiResponse[AuthData])
async def verify_email(
    body: TokenRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[AuthData]:
    check_origin(request)
    issued = await accounts.verify_email(session, body.token, client_info(request))
    return await _signed_in(session, response, issued, "Email terverifikasi.")


@router.post("/resend-verification", response_model=ApiResponse[None])
async def resend_verification(
    body: EmailRequest, request: Request, session: AsyncSession = Depends(get_db)
) -> ApiResponse[None]:
    check_origin(request)
    await accounts.resend_verification(session, body.email, client_info(request))
    return ApiResponse(message=accounts.EMAIL_SENT, data=None)


@router.post("/forgot-password", response_model=ApiResponse[None])
async def forgot_password(
    body: EmailRequest, request: Request, session: AsyncSession = Depends(get_db)
) -> ApiResponse[None]:
    check_origin(request)
    await accounts.forgot_password(session, body.email, client_info(request))
    return ApiResponse(message=accounts.EMAIL_SENT, data=None)


@router.post("/reset-password", response_model=ApiResponse[None])
async def reset_password(
    body: ResetPasswordRequest, request: Request, session: AsyncSession = Depends(get_db)
) -> ApiResponse[None]:
    check_origin(request)
    await accounts.reset_password(session, body, client_info(request))
    return ApiResponse(message=accounts.PASSWORD_CHANGED, data=None)


@router.get("/invite/{token}", response_model=ApiResponse[InvitePreview])
async def invite_preview(
    token: str, request: Request, session: AsyncSession = Depends(get_db)
) -> ApiResponse[InvitePreview]:
    return ApiResponse(data=await accounts.invite_preview(session, token, client_info(request)))


@router.post("/accept-invite", response_model=ApiResponse[AuthData])
async def accept_invite(
    body: AcceptInviteRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[AuthData]:
    check_origin(request)
    issued = await accounts.accept_invite(session, body, client_info(request))
    return await _signed_in(session, response, issued, "Selamat bergabung.")
