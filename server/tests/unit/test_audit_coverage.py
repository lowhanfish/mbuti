"""Setiap rute yang mengubah data harus terdaftar di jejak audit."""

from app.services.audit import ACTIONS, PREFIX
from main import create_application


def test_every_changing_route_is_registered():
    paths = create_application().openapi()["paths"]
    routes = {
        (method.upper(), path.removeprefix(PREFIX))
        for path, operations in paths.items()
        if path.startswith(PREFIX)
        for method in operations
        if method != "get"
    }

    assert routes - set(ACTIONS) == set(), "Rute baru belum terdaftar di app/services/audit.py"
    assert set(ACTIONS) - routes == set(), "Daftar jejak audit memuat rute yang sudah tidak ada"
