"""Spreadsheet: membaca data, memeriksa rancangan, menghitung, dan menulis Excel (kontrak 19)."""

import datetime
import io
import zipfile

import pytest
from openpyxl import Workbook, load_workbook

from app.services.letters import render
from app.services.sheets import build
from app.services.sheets.design import DataTable, asks_for_sheet, clean_sheet, offers_sheet
from app.services.sheets.read import DataError, parse_number, read_tables, summary

CSV = (
    b"Bidang;Kegiatan;Pagu;Realisasi\n"
    b"Pelayanan;Loket terpadu;Rp 120.000.000;98.000.000\n"
    b'Data;=HYPERLINK("x");150000000;132000000\n'
    b"Pelayanan;Layanan keliling;80000000;31000000\n"
    b"Data;Pelatihan;0;0\n"
)


def design(**sheet) -> dict:
    base = {
        "name": "Realisasi: per/bidang",
        "source": "D1",
        "columns": [
            {"header": "Bidang", "source_column": "bidang", "format": "text", "total": "none"},
            {"header": "Kegiatan", "source_column": "Kegiatan", "format": "text", "total": "count"},
            {"header": "Pagu", "source_column": "Pagu", "format": "currency", "total": "sum"},
            {
                "header": "Realisasi",
                "source_column": "Realisasi",
                "format": "currency",
                "total": "sum",
            },
            {
                "header": "Persentase",
                "op": "divide",
                "operands": ["Realisasi", "Pagu"],
                "format": "percent",
                "total": "none",
            },
        ],
        "group_by": "Bidang",
        "sort_by": "Pagu",
        "sort_desc": True,
        "flag": {"column": "Persentase", "operator": "lt", "value": "50"},
    }
    return {"sheets": [{**base, **sheet}]}


def data_table(table) -> DataTable:
    item = summary(table)
    return DataTable(
        "D1",
        "a" * 32,
        "realisasi.csv",
        0,
        item["name"],
        item["columns"],
        item["row_count"],
        item["sample"],
    )


def workbook(rows: list[list]) -> bytes:
    book = Workbook()
    for row in rows:
        book.active.append(row)
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def test_numbers_in_both_styles_but_not_identifiers():
    values = ("Rp 1.250.000", "12,5", "45%", "(1.000)", "1,234.50", "007", "199001012015031001")

    assert [parse_number(v) for v in values] == [1250000, 12.5, 0.45, -1000, 1234.5, None, None]


def test_reads_csv_and_xlsx_with_column_types():
    [table] = read_tables("csv", CSV)
    [excel] = read_tables(
        "xlsx", workbook([[], ["Nama", "", "Tanggal"], ["Ani", "007", datetime.date(2026, 1, 5)]])
    )

    assert table.types == ["teks", "teks", "angka", "angka"]
    assert table.rows[0][2:] == [120000000, 98000000]
    assert excel.columns == ["Nama", "Kolom 2", "Tanggal"]
    assert excel.types == ["teks", "teks", "tanggal"]


def test_rejects_unsafe_or_oversized_files():
    macro = io.BytesIO()
    with zipfile.ZipFile(macro, "w") as archive:
        archive.writestr("xl/workbook.xml", "<x/>")
        archive.writestr("xl/vbaProject.bin", "x")

    for extension, data in (
        ("xlsx", macro.getvalue()),
        ("xlsx", b"PK bukan arsip"),
        ("csv", b"A;B\n"),
        ("csv", ("A\n" + "1\n" * 5001).encode()),
    ):
        with pytest.raises(DataError):
            read_tables(extension, data)


def test_which_tasks_may_return_a_sheet():
    assert offers_sheet("Rekap kehadiran harian")
    assert not asks_for_sheet("Rekap kehadiran harian")
    assert asks_for_sheet("Tolong buatkan Excel daftar inventaris")


def test_design_drops_what_it_does_not_know():
    [table] = read_tables("csv", CSV)
    raw = design(group_by="Kolom hilang")
    raw["sheets"][0]["columns"].append(
        {"header": "Selisih", "op": "subtract", "operands": ["Bidang", "Pagu"], "format": "number"}
    )

    cleaned = clean_sheet(raw, [data_table(table)])

    assert [c["header"] for c in cleaned["sheets"][0]["columns"]][-1] == "Persentase"
    assert cleaned["sheets"][0]["flag"]["value"] == 0.5
    assert len(cleaned["dropped"]) == 2
    assert clean_sheet({"sheets": [{"name": "x", "columns": []}]}, []) is None


def test_every_row_is_filled_grouped_and_flagged():
    [table] = read_tables("csv", CSV)
    cleaned = clean_sheet(design(), [data_table(table)])

    sheet = build.compute(cleaned["sheets"][0], table)
    shown = build.preview(sheet, "Realisasi")

    styles = [row["style"] for row in shown["rows"]]
    assert styles == ["normal", "flag", "subtotal", "normal", "normal", "subtotal", "total"]
    assert shown["rows"][-1]["cells"] == [
        "Jumlah seluruhnya",
        "4",
        "Rp 350.000.000",
        "Rp 261.000.000",
        "74,6%",
    ]
    assert (shown["row_count"], shown["flagged"]) == (4, 1)
    assert shown["flag_rule"] == "Persentase di bawah 50%"
    assert shown["columns"][-1]["formula"] == "Realisasi ÷ Pagu"


def test_text_rows_are_marked_as_unverified(monkeypatch):
    monkeypatch.setattr(render, "soffice_path", lambda: None)
    cleaned = clean_sheet(
        {
            "sheets": [
                {
                    "name": "Anggaran",
                    "columns": [
                        {"header": "Uraian", "format": "text", "total": "none"},
                        {"header": "Nilai", "format": "currency", "total": "sum"},
                    ],
                    "rows": [["ATK", "1.500.000"], ["Konsumsi", "belum ada"]],
                }
            ]
        },
        [],
    )

    built = build.build(cleaned, {})

    assert cleaned["origin"] == "text"
    assert built.preview[0]["rows"][-1]["cells"] == ["Jumlah seluruhnya", "Rp 1.500.000"]
    assert [c["passed"] for c in built.checks] == [False, False, False]


@pytest.mark.skipif(render.soffice_path() is None, reason="LibreOffice tidak terpasang")
def test_libreoffice_agrees_with_program_totals():
    [table] = read_tables("csv", CSV)
    raw = design()
    raw["sheets"][0]["columns"][2]["total"] = "average"
    raw["sheets"].append(
        {
            "name": "Terbesar",
            "source": "D1",
            "columns": [
                {"header": "Pagu", "source_column": "Pagu", "format": "currency", "total": "max"},
                {
                    "header": "Realisasi",
                    "source_column": "Realisasi",
                    "format": "number",
                    "total": "min",
                },
                {
                    "header": "Kali",
                    "op": "multiply",
                    "operands": ["Pagu", "Realisasi"],
                    "format": "number",
                    "total": "none",
                },
            ],
        }
    )
    cleaned = clean_sheet(raw, [data_table(table)])

    built = build.build(cleaned, {"D1": table})

    assert built.checks[-1] == {
        "text": "Rumus dihitung LibreOffice dan cocok dengan program",
        "passed": True,
        "ref": "",
    }, built.checks
    formulas = load_workbook(io.BytesIO(built.xlsx))
    values = load_workbook(io.BytesIO(built.xlsx), data_only=True)
    assert formulas.sheetnames == ["Realisasi per bidang", "Terbesar"]
    page = formulas.worksheets[0]
    assert page["E2"].value.startswith("=IF(OR(") and page["D8"].value.startswith("=SUBTOTAL(9,")
    assert values.worksheets[0]["D8"].value == 261000000
    assert page["A1"].font.bold and page["C2"].number_format.endswith("#,##0")
    assert (
        page.page_setup.orientation == "landscape" and page.sheet_properties.pageSetUpPr.fitToPage
    )
    # Teks yang diawali "=" tidak menjadi rumus
    cells = [c for row in page.iter_rows() for c in row if str(c.value).startswith("=HYPERLINK")]
    assert [c.data_type for c in cells] == ["s"]
