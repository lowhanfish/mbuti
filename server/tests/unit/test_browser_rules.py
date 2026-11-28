"""Penggolongan tombol dan pengaman alamat (E4b)."""

import pytest

from app.core.config import settings
from app.services.browser.network import is_public, local_targets, request_origin, resolve_allowed
from app.services.browser.risk import click_risk, is_card_field

POST_FORM = {"method": "post", "action_path": "/laporan"}


@pytest.mark.parametrize(
    ("element", "expected"),
    [
        ({"role": "button", "name": "Kirim laporan"}, "submit"),
        ({"role": "button", "name": "Hapus"}, "delete"),
        ({"role": "link", "name": "Hapus data", "href": "/x/1/hapus"}, "delete"),
        ({"role": "button", "name": "Bayar sekarang"}, "payment"),
        ({"role": "link", "name": "Laporan Pembayaran", "href": "/pembayaran"}, "none"),
        ({"role": "link", "name": "Tambah laporan", "href": "/laporan/baru"}, "none"),
        ({"role": "link", "name": "Simpan", "href": "#"}, "submit"),
        (
            {"role": "button", "tag": "button", "type": "", "name": "OK", "form": POST_FORM},
            "submit",
        ),
        (
            {
                "role": "button",
                "tag": "button",
                "type": "submit",
                "name": "Cari",
                "form": {"method": "get"},
            },
            "none",
        ),
        ({"role": "button", "tag": "button", "type": "button", "name": "Buka menu"}, "none"),
        ({"role": "checkbox", "name": "Kirim salinan"}, "none"),
    ],
)
def test_click_risk(element, expected):
    assert click_risk(element) == expected


def test_card_fields_are_recognised():
    assert is_card_field({"autocomplete": "cc-number"})
    assert is_card_field({"name": "Nomor kartu"})
    assert not is_card_field({"name": "Nomor surat", "autocomplete": ""})


@pytest.mark.parametrize(
    ("address", "public"),
    [
        ("8.8.8.8", True),
        ("127.0.0.1", False),
        ("10.1.2.3", False),
        ("192.168.0.10", False),
        ("169.254.169.254", False),
        ("::1", False),
        ("fd00::1", False),
        ("::ffff:10.0.0.1", False),
        ("0.0.0.0", False),
    ],
)
def test_internal_addresses_are_not_public(address, public):
    assert is_public(address) is public


async def test_internal_hosts_only_when_registered_outside_production(monkeypatch):
    origins = frozenset({"http://127.0.0.1:8765"})
    local = local_targets(origins)

    assert await resolve_allowed("127.0.0.1", 8765, local)
    assert await resolve_allowed("127.0.0.1", 5432, local) is None
    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert await resolve_allowed("127.0.0.1", 8765, local_targets(origins)) is None


@pytest.mark.parametrize(
    ("url", "origin"),
    [
        ("https://App.test:443/a?b=1", "https://app.test"),
        ("wss://app.test/soket", "https://app.test"),
        ("data:text/html,x", ""),
        ("file:///etc/passwd", ""),
    ],
)
def test_request_origin(url, origin):
    assert request_origin(url) == origin
