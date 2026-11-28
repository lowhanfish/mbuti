"""TOTP, enkripsi, dan alamat brankas (E4a)."""

import base64

import pytest

from app.core import encryption, totp
from app.services import two_factor
from app.services.vault.addresses import origin_of

# Rahasia contoh dari lampiran RFC 6238
RFC_SECRET = base64.b32encode(b"12345678901234567890").decode()


@pytest.mark.parametrize(
    ("moment", "expected"), [(59, "94287082"), (1111111109, "07081804"), (2000000000, "69279037")]
)
def test_totp_matches_rfc_vectors(moment, expected):
    assert totp.TotpKey(RFC_SECRET, digits=8).code_at(moment) == expected


def test_totp_window_accepts_only_neighbouring_steps():
    key = totp.generate_key()
    now = 1_000_000.0

    assert key.matching_step(key.code_at(now - 30), now) == int(now // 30) - 1
    assert key.matching_step(key.code_at(now - 90), now) is None


def test_authenticator_key_accepts_spaced_base32_and_otpauth():
    assert totp.parse_key("jbsw y3dp ehpk 3pxp").secret == "JBSWY3DPEHPK3PXP"
    key = totp.parse_key(
        "otpauth://totp/App:a?secret=JBSWY3DPEHPK3PXP&digits=8&period=60&algorithm=sha256"
    )
    assert (key.digits, key.period, key.algorithm) == (8, 60, "SHA256")


@pytest.mark.parametrize(
    "value",
    ["", "pendek", "123456", "otpauth://hotp/a?secret=JBSWY3DPEHPK3PXP", "otpauth://totp/a"],
)
def test_unknown_authenticator_key_is_refused(value):
    with pytest.raises(ValueError):
        totp.parse_key(value)


def test_ciphertext_is_bound_to_its_place():
    sealed = encryption.encrypt("rahasia-contoh", "vault:org-a:baris:password")

    assert "rahasia-contoh" not in sealed
    assert encryption.decrypt(sealed, "vault:org-a:baris:password") == "rahasia-contoh"
    with pytest.raises(encryption.EncryptionError):
        encryption.decrypt(sealed, "vault:org-b:baris:password")


def test_development_key_file_is_created_once_and_private(tmp_path):
    path = tmp_path / "kunci"

    first = encryption._read_key_file(path)

    assert encryption._read_key_file(path) == first
    assert path.stat().st_mode & 0o777 == 0o600


def test_recovery_codes_are_stored_as_fingerprints():
    codes, marks = two_factor.new_recovery_codes()

    assert len(set(codes)) == two_factor.RECOVERY_CODES
    assert not set(codes) & set(marks)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("https://App.Contoh.test/masuk?x=1", "https://app.contoh.test"),
        ("https://app.contoh.test:443/", "https://app.contoh.test"),
        ("http://localhost:8765/masuk", "http://localhost:8765"),
        ("https://bücher.test/", "https://xn--bcher-kva.test"),
    ],
)
def test_origin_is_normalised(value, expected):
    assert origin_of(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "app.contoh.test",
        "javascript:alert(1)",
        "file:///etc/passwd",
        "https://pengguna:sandi@app.test/",
        "https://app.test\\@jahat.test/",
        "https://app.test /masuk",
        "https://app.test:99999/",
    ],
)
def test_ambiguous_address_is_refused(value):
    with pytest.raises(ValueError):
        origin_of(value)
