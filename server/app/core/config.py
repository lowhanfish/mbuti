"""Pengaturan aplikasi dari variabel lingkungan dan `server/.env`."""

import json
import secrets
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

SERVER_DIR = Path(__file__).resolve().parents[2]


def parse_database_url(raw: str) -> URL:
    """
    Baca `DATABASE_URL` dan arahkan ke driver psycopg 3.

    Pesan galat tidak boleh memuat isi URL karena berisi kata sandi.
    """
    try:
        url = make_url(raw.strip())
    except Exception:
        # Pesan asli SQLAlchemy memuat URL lengkap, jadi rantai galatnya diputus.
        raise ValueError(
            "DATABASE_URL tidak bisa dibaca. Bentuknya "
            "postgresql://pengguna:sandi@host:5432/nama_database."
        ) from None

    if url.drivername.split("+")[0] not in {"postgresql", "postgres"}:
        raise ValueError("DATABASE_URL harus berawalan postgresql://.")
    if "@" in (url.host or ""):
        raise ValueError("Karakter khusus di kata sandi DATABASE_URL harus di-percent-encode.")
    if not url.database:
        raise ValueError("DATABASE_URL harus menyebut nama database.")
    return url.set(drivername="postgresql+psycopg")


class Settings(BaseSettings):
    """
    Variabel lingkungan mengalahkan isi `.env`. Variabel yang tidak dikenal diabaikan,
    sehingga `.env` boleh memuat pengaturan tahap berikutnya.
    """

    model_config = SettingsConfigDict(
        env_file=SERVER_DIR / ".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
        case_sensitive=True,
        # Nilai yang salah tidak boleh ikut tercetak di pesan galat (bisa berisi rahasia).
        hide_input_in_errors=True,
    )

    # ==========================
    # APLIKASI
    # ==========================
    APP_NAME: str = "MBUTI"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_HOST: str = "127.0.0.1"
    APP_PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    # ==========================
    # DATABASE (PostgreSQL)
    # ==========================
    # Bila diisi, dipakai sebagai pengganti DB_HOST, DB_PORT, DB_NAME, DB_USER, dan DB_PASSWORD.
    DATABASE_URL: SecretStr = Field(default=SecretStr(""))
    # Saat APP_ENV=testing, nama database diganti dengan ini pada server yang sama.
    TEST_DB_NAME: str = "mbuti_test"
    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 5432
    DB_NAME: str = "mbuti"
    # Kosong berarti memakai nama pengguna sistem operasi (bawaan libpq).
    DB_USER: str = ""
    DB_PASSWORD: SecretStr = Field(default=SecretStr(""))
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DB_CONNECT_TIMEOUT: int = 10
    DB_ECHO: bool = False

    # ==========================
    # REDIS DAN CELERY
    # ==========================
    # Basis data 1 agar tidak bercampur dengan aplikasi lain yang memakai basis data 0.
    REDIS_URL: str = "redis://127.0.0.1:6379/1"
    # Kosong berarti sama dengan REDIS_URL.
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""

    # ==========================
    # SESI MASUK
    # ==========================
    # Wajib di produksi. Di pengembangan boleh kosong: dibuat acak tiap aplikasi menyala.
    JWT_SECRET_KEY: SecretStr = Field(default=SecretStr(""))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    # Wajib true di produksi (HTTPS)
    COOKIE_SECURE: bool = False
    # Percobaan masuk per menit dari satu alamat, dan kegagalan per 5 menit untuk satu email
    LOGIN_LIMIT_PER_MINUTE: int = 20
    LOGIN_FAILURE_LIMIT: int = 5

    # ==========================
    # AKUN MANDIRI DAN EMAIL
    # ==========================
    # closed: hanya lewat skrip dan undangan; approval: organisasi baru menunggu persetujuan
    # pengelola (`python -m scripts.setujui_organisasi`); open: langsung aktif
    REGISTRATION_MODE: Literal["closed", "approval", "open"] = "approval"
    # Alamat frontend, untuk tautan di email
    APP_URL: str = "http://localhost:3000"
    # console: isi email (termasuk tautan) ditulis ke log worker, untuk pengembangan
    EMAIL_BACKEND: Literal["console", "smtp"] = "console"
    EMAIL_FROM: str = "MBUTI <no-reply@mbuti.local>"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: SecretStr = Field(default=SecretStr(""))
    SMTP_STARTTLS: bool = True
    SMTP_TIMEOUT_SECONDS: int = 20

    # ==========================
    # PEMBERITAHUAN PEMANTAUAN (scripts.periksa)
    # ==========================
    # Penerima email saat pemeriksaan GAGAL dan saat pulih. Kosong berarti tidak ada email.
    ALERT_EMAILS: Annotated[list[str], NoDecode] = Field(default_factory=list)
    # Selama masih gagal, pengingat dikirim ulang setiap sekian jam
    ALERT_REMIND_HOURS: int = 6
    # Keadaan pemberitahuan terakhir, agar email tidak dikirim tiap 5 menit
    ALERT_STATE_FILE: Path = SERVER_DIR / ".periksa-status.json"

    # ==========================
    # MODEL AI
    # ==========================
    # Kunci utama; kunci cadangan bernama GEMINI_API_KEY1, GEMINI_API_KEY2, ...
    GEMINI_API_KEY: SecretStr = Field(default=SecretStr(""))
    GEMINI_TIMEOUT_SECONDS: int = 30
    # Lama sebuah kunci diistirahatkan setelah kena batas permintaan
    GEMINI_KEY_COOLDOWN_SECONDS: int = 60
    # "mock" menghitung vektor sendiri tanpa memanggil layanan luar (untuk pengujian)
    EMBEDDING_PROVIDER: Literal["gemini", "mock"] = "gemini"
    LLM_PROVIDER: Literal["gemini", "mock"] = "gemini"
    # Model bawaan tiap profil; organisasi bisa menggantinya di Pengaturan > Model AI.
    # Dipilih dari yang menjawab dengan kunci tier gratis pada 26 November 2026. Cadangan harus
    # berbeda dari model seimbang, kalau tidak profil itu tidak punya pengganti.
    LLM_MODEL_FAST: str = "gemini-3.1-flash-lite"
    LLM_MODEL_BALANCED: str = "gemini-3.5-flash-lite"
    LLM_MODEL_THOROUGH: str = "gemini-4-hydrogen"
    LLM_FALLBACK_MODEL: str = "gemini-3.1-flash-lite"
    GENERATION_TIMEOUT_SECONDS: int = 60
    # Kurs untuk mengubah harga dolar menjadi rupiah (JISDOR 10 November 2026: 18.059)
    USD_IDR_RATE: int = 18_000
    # Potongan dokumen yang lebih jauh dari ini tidak diberikan kepada role
    RETRIEVAL_MAX_DISTANCE: float = 0.55
    EMBEDDING_MODEL: str = "gemini-embedding-2"
    EMBEDDING_DIMENSION: Literal[768] = 768
    # Potongan dengan jarak kosinus di atas ini dianggap tidak berkaitan. Diukur pada
    # gemini-embedding-2 (26 November 2026, teks Indonesia): relevan 0,19-0,25; topik asing >= 0,45.
    SEARCH_MAX_DISTANCE: float = 0.42

    # ==========================
    # UNGGAHAN
    # ==========================
    UPLOAD_DIR: Path = SERVER_DIR / "uploads"
    MAX_UPLOAD_BYTES: int = 20 * 1024 * 1024

    # ==========================
    # BATAS LAJU (per menit, per pengguna)
    # ==========================
    RATE_TRIAL_PER_MINUTE: int = 10
    RATE_UPLOAD_PER_MINUTE: int = 20
    RATE_TASK_PER_MINUTE: int = 20
    RATE_SEARCH_PER_MINUTE: int = 60
    # Per alamat, karena pengguna belum dikenali
    RATE_REFRESH_PER_MINUTE: int = 60
    # Per jam: pendaftaran per alamat; permintaan email per email dan per alamat; tautan per alamat
    RATE_REGISTER_PER_HOUR: int = 5
    RATE_EMAIL_PER_HOUR: int = 3
    RATE_EMAIL_PER_HOUR_PER_IP: int = 10
    RATE_LINK_PER_HOUR: int = 30

    # ==========================
    # CORS
    # ==========================
    ALLOWED_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, value: Any) -> Any:
        """Terima larik JSON atau daftar dipisah koma."""
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return json.loads(text)
            return [origin.strip() for origin in text.split(",") if origin.strip()]
        return value

    @field_validator("ALERT_EMAILS", mode="before")
    @classmethod
    def parse_alert_emails(cls, value: Any) -> Any:
        """Daftar dipisah koma."""
        if isinstance(value, str):
            return [email.strip() for email in value.split(",") if email.strip()]
        return value

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def reject_wildcard(cls, value: list[str]) -> list[str]:
        if "*" in value:
            raise ValueError("ALLOWED_ORIGINS tidak boleh '*' karena permintaan membawa cookie.")
        return value

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        level = value.upper()
        valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if level not in valid:
            raise ValueError(f"LOG_LEVEL harus salah satu dari {sorted(valid)}")
        return level

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, value: SecretStr) -> SecretStr:
        if value.get_secret_value():
            parse_database_url(value.get_secret_value())
        return value

    @field_validator("TEST_DB_NAME")
    @classmethod
    def validate_test_database(cls, value: str) -> str:
        if not value.endswith("_test"):
            raise ValueError("TEST_DB_NAME harus berakhiran '_test'.")
        return value

    @model_validator(mode="after")
    def secure_session_settings(self) -> "Settings":
        secret = self.JWT_SECRET_KEY.get_secret_value()
        if self.APP_ENV == "production":
            if len(secret) < 32:
                raise ValueError("JWT_SECRET_KEY wajib diisi, minimal 32 karakter, di produksi.")
            if not self.COOKIE_SECURE:
                raise ValueError("COOKIE_SECURE harus true di produksi.")
        elif not secret:
            self.JWT_SECRET_KEY = SecretStr(secrets.token_urlsafe(48))
        return self

    def get_database_url(self) -> URL:
        """URL SQLAlchemy untuk PostgreSQL lewat psycopg 3."""
        if self.DATABASE_URL.get_secret_value():
            url = parse_database_url(self.DATABASE_URL.get_secret_value())
        else:
            url = URL.create(
                drivername="postgresql+psycopg",
                username=self.DB_USER or None,
                password=self.DB_PASSWORD.get_secret_value() or None,
                host=self.DB_HOST,
                port=self.DB_PORT,
                database=self.DB_NAME,
            )
        # Pengujian tidak boleh menyentuh database pengembangan, dari mana pun URL-nya berasal.
        if self.APP_ENV == "testing":
            url = url.set(database=self.TEST_DB_NAME)
        return url

    def app_link(self, path: str) -> str:
        """Tautan lengkap ke halaman frontend, untuk email."""
        return f"{self.APP_URL.rstrip('/')}{path}"

    @property
    def celery_broker_url(self) -> str:
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def celery_result_backend(self) -> str:
        return self.CELERY_RESULT_BACKEND or self.REDIS_URL


settings = Settings()
