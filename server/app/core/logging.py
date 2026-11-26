"""Konfigurasi log. Log tidak memuat kunci API, kata sandi, atau isi dokumen."""

import logging
import sys

from app.core.config import settings

LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d - %(message)s"


def setup_logging() -> None:
    """Pasang satu penangan log ke stdout untuk API dan worker."""
    logging.basicConfig(
        level=settings.LOG_LEVEL,
        format=LOG_FORMAT,
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )

    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DB_ECHO else logging.WARNING
    )
    logging.getLogger("psycopg").setLevel(logging.WARNING)


logger = logging.getLogger("mbuti")
