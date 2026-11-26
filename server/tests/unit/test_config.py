"""Pengaturan dibaca dari berkas .env buatan tes, bukan dari server/.env."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import SERVER_DIR, Settings


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Buang variabel lingkungan agar hanya isi berkas tes yang berpengaruh."""
    for name in Settings.model_fields:
        monkeypatch.delenv(name, raising=False)


def load(tmp_path: Path, content: str) -> Settings:
    env_file = tmp_path / ".env"
    env_file.write_text(content, encoding="utf-8")
    return Settings(_env_file=env_file)


def test_env_file_is_resolved_from_server_directory() -> None:
    assert Settings.model_config["env_file"] == SERVER_DIR / ".env"
    assert (SERVER_DIR / "main.py").is_file()


def test_unknown_variables_are_ignored(tmp_path: Path) -> None:
    settings = load(
        tmp_path,
        "GEMINI_API_KEY=kunci-palsu\nGEMINI_API_KEY1=kunci-palsu-1\n"
        "LLM_MODEL_FAST=model-palsu\nVARIABEL_ASING=1\nDB_NAME=contoh\n",
    )

    assert settings.DB_NAME == "contoh"
    assert not hasattr(settings, "VARIABEL_ASING")


def test_empty_values_fall_back_to_defaults(tmp_path: Path) -> None:
    settings = load(tmp_path, "DB_PORT=\nREDIS_URL=\nALLOWED_ORIGINS=\n")

    assert settings.DB_PORT == 5432
    assert settings.REDIS_URL == "redis://127.0.0.1:6379/1"
    assert settings.ALLOWED_ORIGINS == ["http://localhost:3000"]


def test_database_url_uses_psycopg(tmp_path: Path) -> None:
    url = load(tmp_path, "DB_USER=pengguna\nDB_PASSWORD=p@ss:word/1\n").get_database_url()

    assert url.drivername == "postgresql+psycopg"
    assert url.password == "p@ss:word/1"
    assert url.database == "mbuti"
    assert "p@ss" not in str(url)


def test_database_url_without_user_uses_system_default(tmp_path: Path) -> None:
    url = load(tmp_path, "").get_database_url()

    assert url.username is None
    assert url.password is None


@pytest.mark.parametrize(
    "value",
    [
        '["http://localhost:3000", "https://mbuti.example"]',
        "http://localhost:3000, https://mbuti.example",
    ],
)
def test_allowed_origins_accepts_json_and_comma_list(tmp_path: Path, value: str) -> None:
    settings = load(tmp_path, f"ALLOWED_ORIGINS={value}\n")

    assert settings.ALLOWED_ORIGINS == ["http://localhost:3000", "https://mbuti.example"]


def test_wildcard_origin_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        load(tmp_path, "ALLOWED_ORIGINS=*\n")


def test_invalid_value_is_not_echoed_in_error(tmp_path: Path) -> None:
    with pytest.raises(ValidationError) as caught:
        load(tmp_path, "DB_PORT=nilai-rahasia\n")

    assert "nilai-rahasia" not in str(caught.value)


@pytest.mark.parametrize("scheme", ["postgresql", "postgres", "postgresql+asyncpg"])
def test_database_url_overrides_separate_variables(tmp_path: Path, scheme: str) -> None:
    url = load(
        tmp_path,
        f"DATABASE_URL={scheme}://pengguna:p%40ss@db.contoh:6543/utama?sslmode=require\n"
        "DB_HOST=diabaikan\nDB_NAME=diabaikan\n",
    ).get_database_url()

    assert url.drivername == "postgresql+psycopg"
    assert (url.host, url.port, url.database) == ("db.contoh", 6543, "utama")
    assert url.password == "p@ss"
    assert url.query["sslmode"] == "require"
    assert "p@ss" not in str(url)


def test_database_url_is_hidden_in_settings_repr(tmp_path: Path) -> None:
    settings = load(tmp_path, "DATABASE_URL=postgresql://u:sandirahasia@host/utama\n")

    assert "sandirahasia" not in repr(settings)


@pytest.mark.parametrize(
    "value",
    [
        "bukan url sandirahasia",
        "mysql://u:sandirahasia@host/utama",
        "postgresql://u:sandirahasia@host:port/utama",
        "postgresql://u:sandi@rahasia@host/utama",
        "postgresql://u:sandirahasia@host",
    ],
)
def test_invalid_database_url_is_rejected_without_echo(tmp_path: Path, value: str) -> None:
    with pytest.raises(ValidationError) as caught:
        load(tmp_path, f"DATABASE_URL={value}\n")

    assert "rahasia" not in str(caught.value)


@pytest.mark.parametrize(
    "content",
    ["DB_NAME=utama\n", "DATABASE_URL=postgresql://u:s@host/utama\n"],
)
def test_testing_environment_always_uses_test_database(tmp_path: Path, content: str) -> None:
    url = load(tmp_path, f"APP_ENV=testing\n{content}").get_database_url()

    assert url.database == "mbuti_test"


def test_test_database_name_must_end_with_test(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        load(tmp_path, "TEST_DB_NAME=mbuti\n")


def test_celery_urls_default_to_redis_url(tmp_path: Path) -> None:
    settings = load(tmp_path, "REDIS_URL=redis://contoh:6379/3\n")

    assert settings.celery_broker_url == "redis://contoh:6379/3"
    assert settings.celery_result_backend == "redis://contoh:6379/3"
