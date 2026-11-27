"""Pemetaan nama alat ke katalog (kontrak 16.2)."""

import pytest

from app.services.tools.catalog import CATALOG, map_tool, weakest_support


@pytest.mark.parametrize(
    ("requested", "name", "support"),
    [
        ("Ms Word", "Dokumen: DOCX", "upcoming"),
        ("pdf", "Dokumen: PDF", "upcoming"),
        ("  Canva  ", "Media: gambar dan poster", "upcoming"),
        ("foto lapangan", "Baca gambar", "supported"),
        ("AutoCAD", "Baca gambar", "substitute"),
        ("WhatsApp", "WhatsApp", "unsupported"),
        ("Kalkulator", "Kalkulator", "unsupported"),
    ],
)
def test_map_tool(requested: str, name: str, support: str) -> None:
    tool = map_tool(requested)

    assert (tool["name"], tool["support"]) == (name, support)
    assert tool["requested"] == requested.strip()


def test_weakest_support_and_catalog() -> None:
    tools = [map_tool("Excel"), map_tool("AutoCAD")]

    assert weakest_support(tools) == "substitute"
    assert weakest_support([]) == "supported"
    assert len({tool.key for tool in CATALOG}) == len(CATALOG)
