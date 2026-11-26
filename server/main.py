"""Titik masuk FastAPI untuk backend MBUTI."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.exceptions import UnhandledExceptionMiddleware, register_exception_handlers
from app.core.lifespan import lifespan
from app.core.limits import BodySizeLimitMiddleware


def create_application() -> FastAPI:
    application = FastAPI(
        title=f"{settings.APP_NAME} API",
        version=__version__,
        description="Backend MBUTI: organisasi virtual berisi role AI.",
        lifespan=lifespan,
        docs_url="/docs" if settings.APP_DEBUG else None,
        redoc_url="/redoc" if settings.APP_DEBUG else None,
        openapi_url="/openapi.json" if settings.APP_DEBUG else None,
    )

    # Middleware yang ditambahkan terakhir berada paling luar: CORS membungkus penangkap galat.
    application.add_middleware(UnhandledExceptionMiddleware)
    application.add_middleware(BodySizeLimitMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(application)
    application.include_router(api_v1_router)
    return application


app = create_application()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=settings.APP_DEBUG,
    )
