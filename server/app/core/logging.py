"""Konfigurasi log. Log tidak memuat kunci API, kata sandi, atau isi dokumen."""

import logging
import sys

from app.core.config import settings
from app.core.request_context import RequestIdFilter

LOG_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(request_id)s | "
    "%(name)s:%(funcName)s:%(lineno)d - %(message)s"
)


def setup_logging() -> None:
    """Pasang satu penangan log ke stdout untuk API dan worker."""
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    logging.basicConfig(level=settings.LOG_LEVEL, format=LOG_FORMAT, handlers=[handler], force=True)

    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DB_ECHO else logging.WARNING
    )
    logging.getLogger("psycopg").setLevel(logging.WARNING)


logger = logging.getLogger("mbuti")
