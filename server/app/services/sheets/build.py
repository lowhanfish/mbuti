"""
Mengisi, menghitung, dan menulis spreadsheet dari rancangan (kontrak 19.3). Excel memuat rumus
hidup; LibreOffice menghitungnya dan hasilnya dicocokkan dengan hitungan program.
"""

import datetime
import io
import logging
import math
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.core.config import settings
from app.services.letters import render
from app.services.sheets.design import NUMERIC
from app.services.sheets.read import Table, parse_date, parse_number

logger = logging.getLogger("mbuti.sheets")

PREVIEW_ROWS = 50
OPERATOR_WORDS = {
    "lt": "di bawah",
    "lte": "paling banyak",
    "gt": "di atas",
    "gte": "paling sedikit",
    "eq": "sama dengan",
    "ne": "bukan",
    "empty": "kosong",
}
SYMBOLS = {"add": "+", "subtract": "-", "multiply": "*", "divide": "/"}
WORDS = {"add": " + ", "subtract": " − ", "multiply": " × ", "divide": " ÷ "}
# Kode fungsi SUBTOTAL; subtotal di dalam rentang otomatis tidak dihitung dua kali
SUBTOTAL = {"sum": 9, "average": 1, "count": 2, "min": 5, "max": 4}
CALC_FILTER = "xlsx:Calc MS Excel 2007 XML"


def _fill(color: str) -> PatternFill:
    return PatternFill("solid", fgColor=color)


FILLS = {"header": "EDE9FE", "flag": "FDE9C8", "subtotal": "F1F0F5", "total": "DDD6FE"}


@dataclass
class Line:
    style: str  # normal, flag, subtotal, total
    values: list
    # Subtotal dan total: rentang baris data yang dirangkum (nomor baris Excel)
    span: tuple[int, int] | None = None


@dataclass
class Computed:
    name: str
    columns: list[dict]
    lines: list[Line]
    row_count: int
    flagged: int
    flag_rule: str
    unreadable: int = 0


@dataclass
class Built:
    xlsx: bytes
    preview: list[dict]
    checks: list[dict] = field(default_factory=list)


def _number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def apply(op: str, values: list) -> int | float | None:
    """Kosong bila ada operand kosong atau pembagian dengan nol."""
    if not all(_number(v) for v in values):
        return None
    if op == "add":
        return sum(values)
    if op == "subtract":
        return values[0] - values[1]
    if op == "multiply":
        return math.prod(values)
    return values[0] / values[1] if values[1] else None


def _total_of(column: dict) -> str:
    """Cara kolom dirangkum: fungsi SUBTOTAL, `recompute`, atau `none`."""
    if column["op"] in ("divide", "add", "subtract"):
        return "recompute"
    if column["op"] == "multiply" and column["total"] == "none":
        return "sum"
    return column["total"]


def _aggregate(function: str, values: list, kind: str) -> object:
    filled = [v for v in values if v is not None]
    if function == "count":
        # Sama dengan Excel: kolom teks menghitung yang terisi, kolom angka hanya angkanya
        if kind in NUMERIC:
            return sum(_number(v) for v in filled)
        return len(filled)
    if kind == "date":
        dates = [v for v in filled if isinstance(v, datetime.datetime)]
        return (min if function == "min" else max)(dates) if dates else None
    numbers = [v for v in filled if _number(v)]
    if function == "average":
        return sum(numbers) / len(numbers) if numbers else None
    if function == "sum":
        return sum(numbers)
    return (min if function == "min" else max)(numbers) if numbers else 0


def _summary(columns: list[dict], rows: list[list]) -> list:
    values: list = [None] * len(columns)
    for index, column in enumerate(columns):
        how = _total_of(column)
        if how == "recompute":
            values[index] = apply(column["op"], [values[i] for i in column["operands"]])
        elif how != "none":
            values[index] = _aggregate(how, [row[index] for row in rows], column["format"])
    return values


def _summarized(columns: list[dict]) -> bool:
    return any(_total_of(c) not in ("none", "recompute") for c in columns)


def _text_value(cell: str, kind: str) -> tuple[object, bool]:
    """Nilai dari teks model; (nilai, tidak terbaca)."""
    if not cell:
        return None, False
    if kind in NUMERIC:
        number = parse_number(cell)
        if number is None:
            return cell, True
        if kind == "percent" and not cell.endswith("%") and abs(number) > 1:
            number = number / 100
        return number, False
    if kind == "date":
        found = parse_date(cell)
        return (found, False) if found else (cell, True)
    return cell, False


def _rows(spec: dict, table: Table | None) -> tuple[list[list], int]:
    """Semua baris hasil, kolom hitungan sudah diisi."""
    columns = spec["columns"]
    unreadable = 0
    rows = []
    for raw in table.rows if table else spec["rows"]:
        values: list = []
        typed = iter(raw) if table is None else None
        for column in columns:
            if column["op"]:
                values.append(apply(column["op"], [values[i] for i in column["operands"]]))
            elif table is not None:
                values.append(raw[column["from"]])
            else:
                value, bad = _text_value(next(typed), column["format"])
                unreadable += bad
                values.append(value)
        rows.append(values)
    return rows, unreadable


def _sort_key(value: object) -> tuple:
    if _number(value):
        return (0, value)
    if isinstance(value, datetime.datetime):
        return (1, value.timestamp())
    return (2, str(value).lower())


def _flagged(flag: dict | None, columns: list[dict], row: list) -> bool:
    if flag is None:
        return False
    value, operator, wanted = row[flag["column"]], flag["operator"], flag["value"]
    if operator == "empty":
        return value is None
    if value is None:
        return False
    kind = columns[flag["column"]]["format"]
    if kind == "date":
        wanted = parse_date(wanted)
        if wanted is None or not isinstance(value, datetime.datetime):
            return False
    elif kind == "text":
        value, wanted = str(value).lower(), wanted.lower()
    elif not _number(value):
        return False
    if operator == "eq":
        return value == wanted
    if operator == "ne":
        return value != wanted
    if operator == "lt":
        return value < wanted
    if operator == "lte":
        return value <= wanted
    return value > wanted if operator == "gt" else value >= wanted


def _grouped(number: int | float, decimals: int) -> str:
    text = f"{number:,.{decimals}f}"
    return text.translate(str.maketrans(",.", ".,"))


def display(value: object, kind: str) -> str:
    """Nilai siap tampil dengan gaya Indonesia."""
    if value is None:
        return ""
    if isinstance(value, datetime.datetime):
        return value.strftime("%d/%m/%Y")
    if not _number(value):
        return str(value)
    if kind == "percent":
        return _grouped(value * 100, 1).removesuffix(",0") + "%"
    if kind == "currency":
        sign = "-" if value < 0 and round(value) else ""
        return f"{sign}Rp {_grouped(abs(value), 0)}"
    text = _grouped(value, 2)
    return text.rstrip("0").rstrip(",") if "," in text else text


def _flag_rule(flag: dict | None, columns: list[dict]) -> str:
    if flag is None:
        return ""
    column = columns[flag["column"]]
    words = OPERATOR_WORDS[flag["operator"]]
    if flag["operator"] == "empty":
        return f"{column['header']} {words}"
    return f"{column['header']} {words} {display(flag['value'], column['format'])}"


def compute(spec: dict, table: Table | None) -> Computed:
    columns = spec["columns"]
    rows, unreadable = _rows(spec, table)
    group, sort, flag = spec["group_by"], spec["sort_by"], spec["flag"]
    first_seen: dict = {}
    if group is not None:
        for row in rows:
            first_seen.setdefault(row[group], len(first_seen))
    if sort is not None:
        filled = [row for row in rows if row[sort] is not None]
        filled.sort(key=lambda row: _sort_key(row[sort]), reverse=spec["sort_desc"])
        rows = filled + [row for row in rows if row[sort] is None]
        if group is not None and group == sort:
            first_seen = {}
            for row in rows:
                first_seen.setdefault(row[group], len(first_seen))

    summarized = _summarized(columns)
    blocks: list[tuple[object, list[list]]] = [(None, rows)]
    if group is not None:
        members: dict = {key: [] for key in first_seen}
        for row in rows:
            members[row[group]].append(row)
        blocks = list(members.items())
    # Tulisan "Jumlah ..." diletakkan di kolom pertama yang tidak dirangkum
    free = [i for i, c in enumerate(columns) if _total_of(c) == "none"]
    label_at = next((i for i in free if columns[i]["format"] == "text"), next(iter(free), None))

    lines: list[Line] = []
    flagged = 0

    def summary_line(style: str, members: list[list], label: str, span: tuple[int, int]) -> Line:
        values = _summary(columns, members)
        if label_at is not None:
            values[label_at] = label
        return Line(style, values, span)

    for key, members in blocks:
        start = len(lines) + 2
        for row in members:
            marked = _flagged(flag, columns, row)
            flagged += marked
            lines.append(Line("flag" if marked else "normal", row))
        if group is not None and summarized and members:
            name = display(key, columns[group]["format"]) or "(kosong)"
            lines.append(
                summary_line("subtotal", members, f"Jumlah {name}", (start, len(lines) + 1))
            )
    if summarized and rows:
        lines.append(summary_line("total", rows, "Jumlah seluruhnya", (2, len(lines) + 1)))
    return Computed(
        name=spec["name"],
        columns=columns,
        lines=lines,
        row_count=len(rows),
        flagged=flagged,
        flag_rule=_flag_rule(flag, columns),
        unreadable=unreadable,
    )


def _formula_words(column: dict, columns: list[dict]) -> str:
    if not column["op"]:
        return ""
    return WORDS[column["op"]].join(columns[i]["header"] for i in column["operands"])


def preview(sheet: Computed, name: str) -> dict:
    """Paling banyak PREVIEW_ROWS baris data, subtotal kelompoknya, dan total."""
    kinds = [c["format"] for c in sheet.columns]
    rows = []
    shown = 0
    pending = False
    for line in sheet.lines:
        data = line.style in ("normal", "flag")
        if data:
            if shown >= PREVIEW_ROWS:
                continue
            shown += 1
            pending = True
        elif line.style == "subtotal":
            if not pending:
                continue
            pending = False
        cells = []
        for index, value in enumerate(line.values):
            column = sheet.columns[index]
            counted = not data and _total_of(column) == "count"
            cells.append(display(value, "number" if counted else kinds[index]))
        rows.append({"style": line.style, "cells": cells})
    return {
        "name": name,
        "columns": [
            {
                "header": c["header"],
                "format": c["format"],
                "formula": _formula_words(c, sheet.columns),
            }
            for c in sheet.columns
        ],
        "rows": rows,
        "row_count": sheet.row_count,
        "flagged": sheet.flagged,
        "flag_rule": sheet.flag_rule,
    }


def sheet_names(names: list[str]) -> list[str]:
    """Nama lembar yang diterima Excel: ≤31, tanpa []:*?/\\, dan unik."""
    result: list[str] = []
    seen = {"history"}
    for number, name in enumerate(names, start=1):
        base = " ".join(re.sub(r"[\[\]:*?/\\]", " ", name).split()).strip("'")[:31].strip()
        base = base or f"Lembar {number}"
        candidate, count = base, 1
        while candidate.lower() in seen:
            count += 1
            suffix = f" {count}"
            candidate = f"{base[: 31 - len(suffix)]}{suffix}"
        seen.add(candidate.lower())
        result.append(candidate)
    return result


def _put(cell, value: object) -> None:
    if isinstance(value, str):
        cell.value = ILLEGAL_CHARACTERS_RE.sub("", value)
        # Teks yang diawali "=" tetap teks, bukan rumus
        cell.data_type = "s"
    else:
        cell.value = value


def _formula(line: Line, row: int, index: int, columns: list[dict]) -> str | None:
    """Rumus satu sel, atau None bila sel itu berisi nilai biasa."""
    column = columns[index]
    letter = get_column_letter(index + 1)
    how = _total_of(column)
    if line.span is not None and how != "recompute":
        if how == "none":
            return None
        code = 3 if how == "count" and column["format"] == "text" else SUBTOTAL[how]
        formula = f"SUBTOTAL({code},{letter}{line.span[0]}:{letter}{line.span[1]})"
        return f'=IFERROR({formula},"")' if how == "average" else f"={formula}"
    if not column["op"]:
        return None
    if line.span is not None and any(_total_of(columns[i]) == "none" for i in column["operands"]):
        return None
    cells = [f"{get_column_letter(i + 1)}{row}" for i in column["operands"]]
    empty = [f'{cell}=""' for cell in cells]
    if column["op"] == "divide":
        empty.append(f"{cells[1]}=0")
    return f'=IF(OR({",".join(empty)}),"",{SYMBOLS[column["op"]].join(cells)})'


def _number_format(kind: str, values: list) -> str | None:
    if kind == "currency":
        return '"Rp" #,##0;-"Rp" #,##0'
    if kind == "percent":
        return "0.0%"
    if kind == "date":
        return "dd/mm/yyyy"
    if kind == "number":
        whole = all(float(v).is_integer() for v in values if _number(v))
        return "#,##0" if whole else "#,##0.00"
    return None


def write(sheets: list[Computed], names: list[str]) -> tuple[bytes, dict]:
    """Berkas XLSX dan nilai yang diharapkan dari tiap sel berumus."""
    book = Workbook()
    book.remove(book.active)
    expected: dict[tuple[int, str], object] = {}
    for position, (sheet, name) in enumerate(zip(sheets, names, strict=True)):
        page = book.create_sheet(name)
        columns = sheet.columns
        formats = [
            _number_format(c["format"], [line.values[i] for line in sheet.lines])
            for i, c in enumerate(columns)
        ]
        widths = [len(c["header"]) for c in columns]
        for index, column in enumerate(columns, start=1):
            cell = page.cell(1, index)
            _put(cell, column["header"])
            cell.font = Font(bold=True)
            cell.fill = _fill(FILLS["header"])
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        for row, line in enumerate(sheet.lines, start=2):
            for index, value in enumerate(line.values):
                cell = page.cell(row, index + 1)
                formula = _formula(line, row, index, columns)
                if formula is not None:
                    cell.value = formula
                    expected[(position, cell.coordinate)] = value
                elif line.span is None or isinstance(value, str):
                    _put(cell, value)
                counted = line.span is not None and _total_of(columns[index]) == "count"
                if counted:
                    cell.number_format = "#,##0"
                elif formats[index] and not isinstance(value, str):
                    cell.number_format = formats[index]
                if line.style != "normal":
                    cell.fill = _fill(FILLS[line.style])
                if line.span is not None:
                    cell.font = Font(bold=True)
                widths[index] = max(widths[index], len(display(value, columns[index]["format"])))
        for index, width in enumerate(widths, start=1):
            page.column_dimensions[get_column_letter(index)].width = min(50, max(10, width + 3))
        page.freeze_panes = "A2"
        # Cetak: A4 mendatar, semua kolom satu lebar halaman, judul diulang tiap halaman
        page.page_setup.paperSize = page.PAPERSIZE_A4
        page.page_setup.orientation = "landscape"
        page.sheet_properties.pageSetUpPr.fitToPage = True
        page.page_setup.fitToHeight = 0
        page.print_title_rows = "1:1"
    book.calculation.fullCalcOnLoad = True
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue(), expected


def recalculate(xlsx: bytes) -> bytes | None:
    """
    Buka dan simpan ulang dengan LibreOffice agar hasil rumus tersimpan di berkas. None bila
    LibreOffice tidak ada atau gagal; berkas berumus tetap bisa dipakai.
    """
    program = render.soffice_path()
    if program is None:
        logger.warning("LibreOffice tidak ditemukan; rumus tidak dihitung di server.")
        return None
    with tempfile.TemporaryDirectory(prefix="mbuti-tabel-") as folder:
        source = Path(folder) / "tabel.xlsx"
        target = Path(folder) / "hasil"
        source.write_bytes(xlsx)
        command = [
            program,
            f"-env:UserInstallation={(Path(folder) / 'profil').as_uri()}",
            "--headless",
            "--norestore",
            "--nolockcheck",
            "--nodefault",
            "--convert-to",
            CALC_FILTER,
            "--outdir",
            str(target),
            str(source),
        ]
        try:
            subprocess.run(
                command,
                check=True,
                capture_output=True,
                timeout=settings.DOCUMENT_CONVERT_TIMEOUT_SECONDS,
            )
            return (target / "tabel.xlsx").read_bytes()
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("Menghitung spreadsheet gagal: %s", type(exc).__name__)
            return None


def _same(expected: object, actual: object) -> bool:
    if expected is None:
        return actual is None or actual == ""
    if isinstance(expected, datetime.datetime):
        return isinstance(actual, datetime.datetime) and actual.date() == expected.date()
    return _number(actual) and math.isclose(expected, actual, rel_tol=1e-9, abs_tol=1e-6)


def differences(xlsx: bytes, expected: dict) -> int:
    """Jumlah sel berumus yang hasil LibreOffice-nya berbeda dari hitungan program."""
    book = load_workbook(io.BytesIO(xlsx), data_only=True)
    pages = book.worksheets
    return sum(
        not _same(value, pages[position][coordinate].value)
        for (position, coordinate), value in expected.items()
    )


def _check(text: str, passed: bool) -> dict:
    return {"text": text, "passed": passed, "ref": ""}


def build(design: dict, tables: dict[str, Table]) -> Built:
    """`tables`: lembar data menurut labelnya; kosong bila angkanya berasal dari teks."""
    sheets = [
        compute(spec, tables[spec["source"]] if spec["source"] else None)
        for spec in design["sheets"]
    ]
    names = sheet_names([sheet.name for sheet in sheets])
    xlsx, expected = write(sheets, names)
    checks = []
    if design["origin"] == "attachment":
        used = {spec["source"] for spec in design["sheets"]}
        total = sum(len(tables[label].rows) for label in used)
        checks.append(_check(f"{_grouped(total, 0)} baris diambil dari berkas data", True))
    else:
        checks.append(_check("Tidak ada berkas data; cocokkan angkanya dengan sumbernya", False))
    if unreadable := sum(sheet.unreadable for sheet in sheets):
        checks.append(_check(f"{unreadable} isian bukan angka atau tanggal yang sah", False))
    if expected:
        calculated = recalculate(xlsx)
        if calculated is None:
            checks.append(
                _check("Rumus belum dihitung di server; dihitung saat berkas dibuka", False)
            )
        elif wrong := differences(calculated, expected):
            checks.append(_check(f"{wrong} sel berumus berbeda dari hitungan program", False))
        else:
            xlsx = calculated
            checks.append(_check("Rumus dihitung LibreOffice dan cocok dengan program", True))
    checks += [_check(f"Diabaikan dari rancangan: {text}", False) for text in design["dropped"]]
    return Built(
        xlsx=xlsx,
        preview=[preview(sheet, name) for sheet, name in zip(sheets, names, strict=True)],
        checks=checks,
    )
