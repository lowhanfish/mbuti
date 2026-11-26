"""Cookie sesi: token akses dan refresh (HttpOnly) serta token CSRF yang dibaca frontend."""

from fastapi import Response

from app.core.config import settings

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"
# Token refresh hanya dikirim peramban ke endpoint auth
REFRESH_PATH = "/api/v1/auth"


def set_session_cookies(
    response: Response, access_token: str, csrf_token: str, refresh_token: str | None = None
) -> None:
    common = {"secure": settings.COOKIE_SECURE, "samesite": "lax"}
    refresh_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        path="/",
        **common,
    )
    if refresh_token:
        response.set_cookie(
            REFRESH_COOKIE,
            refresh_token,
            max_age=refresh_age,
            httponly=True,
            path=REFRESH_PATH,
            **common,
        )
    response.set_cookie(
        CSRF_COOKIE, csrf_token, max_age=refresh_age, httponly=False, path="/", **common
    )


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH)
    response.delete_cookie(CSRF_COOKIE, path="/")
