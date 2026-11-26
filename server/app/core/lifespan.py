"""Tindakan saat aplikasi mulai dan berhenti."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.db.session import engine


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging()
    logger.info("Memulai %s pada lingkungan [%s]", settings.APP_NAME, settings.APP_ENV)
    database = settings.get_database_url()
    logger.info("Database: %s:%s/%s", database.host, database.port or 5432, database.database)

    yield

    await engine.dispose()
    logger.info("Koneksi database ditutup.")
