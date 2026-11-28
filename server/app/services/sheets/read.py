"""
Membaca lampiran data XLSX dan CSV (kontrak 19.1). Berkas dianggap tidak tepercaya: ukuran,
lembar, kolom, baris, dan panjang sel dibatasi; berkas bermakro ditolak.
"""

import csv
import datetime
import io
import math
import re
import zipfile
from dataclasses import dataclass

from openpyxl import load_workbook

MAX_SHEETS = 10
MAX_COLUMNS = 50
MAX_ROWS = 5000
MAX_CELL = 1000
# Baris yang masih ditelusuri, termasuk baris kosong; mencegah lembar yang dibuat melebar
MAX_SCANNED = 100_000
MAX_UNPACKED_BYTES = 50 * 1024 * 1024
SAMPLE_ROWS = 5

BROKEN = "Berkas data rusak, terkunci, atau tidak bisa dibaca."
EMPTY = "Berkas data tidak berisi baris data."
MACRO = "Berkas bermakro ditolak. Simpan sebagai .xlsx tanpa makro."
TOO_MANY_ROWS = f"Berkas data paling banyak {MAX_ROWS:,} baris.".replace(",", ".")

TEXT, NUMBER, DATE = "teks", "angka", "tanggal"


class DataError(Exception):
    """Pesannya ditampilkan kepada pengguna."""


@dataclass
class Table:
    name: str
    columns: list[str]
    types: list[str]
    rows: list[list]


_GROUPED_ID = re.compile(r"-?\d{1,3}(\.\d{3})+(,\d+)?")
_PLAIN_ID = re.compile(r"-?\d+(,\d+)?")
_PLAIN_EN = re.compile(r"-?\d+\.\d+")
_GROUPED_EN = re.compile(r"-?\d{1,3}(,\d{3})+(\.\d+)?")


def parse_number(text: str) -> int | float | None:
    """
    Angka bertulisan Indonesia atau Inggris. Angka berawalan nol atau lebih dari 15 digit
    (NIP, telepon, kode) bukan angka.
    """
    value = re.sub(r"\s", "", text)
    percent = value.endswith("%")
    value = value.removesuffix("%")
    negative = value.startswith("(") and value.endswith(")")
    if negative:
        value = value[1:-1]
    sign = "-" if value.startswith("-") else ""
    value = value.removeprefix("-")
    if value.lower().startswith("rp"):
        value = value[2:].removeprefix(".")
    value = sign + value.removeprefix("+")
    if _GROUPED_ID.fullmatch(value):
        plain = value.replace(".", "").replace(",", ".")
    elif _PLAIN_ID.fullmatch(value):
        plain = value.replace(",", ".")
    elif _PLAIN_EN.fullmatch(value):
        plain = value
    elif _GROUPED_EN.fullmatch(value):
        plain = value.replace(",", "")
    else:
        return None
    digits = plain.removeprefix("-")
    whole = digits.split(".")[0]
    if (len(whole) > 1 and whole.startswith("0")) or len(digits.replace(".", "")) > 15:
        return None
    number: int | float = float(plain) if "." in plain else int(plain)
    if percent:
        number = number / 100
    return -number if negative else number


_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d %H:%M:%S")


def parse_date(text: str) -> datetime.datetime | None:
    for pattern in _DATE_FORMATS:
        try:
            found = datetime.datetime.strptime(text.strip(), pattern)
        except ValueError:
            continue
        return found if 1900 <= found.year <= 2200 else None
    return None


def _cell(value: object) -> object:
    """Nilai sel yang seragam: None, str, int, float, atau datetime."""
    if value is None:
        return None
    if isinstance(value, bool):
        return "Ya" if value else "Tidak"
    if isinstance(value, int):
        return value if abs(value) < 10**15 else str(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime.combine(value, datetime.time())
    text = str(value).replace("\x00", "").strip()
    if len(text) > MAX_CELL:
        raise DataError(f"Ada sel berisi lebih dari {MAX_CELL} karakter.")
    return text or None


def _headers(row: list, width: int) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for index in range(width):
        value = row[index] if index < len(row) else None
        base = " ".join(str(value).split())[:100] if value is not None else ""
        base = base or f"Kolom {index + 1}"
        name, count = base, 1
        while name.lower() in seen:
            count += 1
            name = f"{base} ({count})"
        seen.add(name.lower())
        names.append(name)
    return names


def _typed(values: list) -> tuple[str, list]:
    """Jenis satu kolom dan nilainya dalam jenis itu."""
    filled = [v for v in values if v is not None]
    if not filled:
        return TEXT, values
    for kind, wanted, parse in (
        (NUMBER, (int, float), parse_number),
        (DATE, datetime.datetime, parse_date),
    ):
        converted = [
            v if v is None or isinstance(v, wanted) else (parse(v) if isinstance(v, str) else None)
            for v in values
        ]
        if all(
            new is not None for old, new in zip(values, converted, strict=True) if old is not None
        ):
            return kind, converted
    return TEXT, [v if v is None or isinstance(v, str) else _plain(v) for v in values]


def _plain(value: object) -> str:
    if isinstance(value, datetime.datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _table(name: str, rows, budget: int) -> Table | None:
    """Baris pertama yang berisi menjadi judul kolom; baris kosong dilewati."""
    header: list | None = None
    body: list[list] = []
    width = 0
    for scanned, raw in enumerate(rows):
        if scanned >= MAX_SCANNED:
            raise DataError(TOO_MANY_ROWS)
        row = [_cell(value) for value in raw]
        while row and row[-1] is None:
            row.pop()
        if not row:
            continue
        if len(row) > MAX_COLUMNS:
            raise DataError(f"Berkas data paling banyak {MAX_COLUMNS} kolom per lembar.")
        width = max(width, len(row))
        if header is None:
            header = row
            continue
        if len(body) >= budget:
            raise DataError(TOO_MANY_ROWS)
        body.append(row)
    if header is None or not body:
        return None
    columns = _headers(header, width)
    typed = [_typed([row[i] if i < len(row) else None for row in body]) for i in range(width)]
    return Table(
        name=name[:100],
        columns=columns,
        types=[kind for kind, _ in typed],
        rows=[list(row) for row in zip(*(values for _, values in typed), strict=True)],
    )


def _from_csv(data: bytes) -> list[Table]:
    if b"\x00" in data:
        raise DataError(BROKEN)
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252", errors="replace")
    first = next((line for line in text.splitlines() if line.strip()), "")
    try:
        delimiter = max(
            (",", ";", "\t"), key=lambda d: len(next(csv.reader([first], delimiter=d), []))
        )
        table = _table(
            "Data", csv.reader(io.StringIO(text, newline=""), delimiter=delimiter), MAX_ROWS
        )
    except csv.Error as exc:
        raise DataError(BROKEN) from exc
    return [table] if table else []


def _check_archive(data: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = archive.namelist()
            if "xl/workbook.xml" not in names:
                raise DataError(BROKEN)
            if sum(item.file_size for item in archive.infolist()) > MAX_UNPACKED_BYTES:
                raise DataError("Isi berkas Excel terlalu besar.")
            if any(name.lower().endswith("vbaproject.bin") for name in names):
                raise DataError(MACRO)
            if b"macroenabled" in archive.read("[Content_Types].xml").lower():
                raise DataError(MACRO)
    except (zipfile.BadZipFile, KeyError, OSError, RuntimeError) as exc:
        raise DataError(BROKEN) from exc


def _from_xlsx(data: bytes) -> list[Table]:
    _check_archive(data)
    tables: list[Table] = []
    remaining = MAX_ROWS
    try:
        # data_only: yang dibaca nilai tersimpan, bukan rumusnya
        book = load_workbook(io.BytesIO(data), read_only=True, data_only=True, keep_links=False)
        try:
            for sheet in book.worksheets:
                sheet.reset_dimensions()
                table = _table(sheet.title, sheet.iter_rows(values_only=True), remaining)
                if table is None:
                    continue
                if len(tables) >= MAX_SHEETS:
                    raise DataError(f"Berkas data paling banyak {MAX_SHEETS} lembar berisi data.")
                tables.append(table)
                remaining -= len(table.rows)
        finally:
            book.close()
    except DataError:
        raise
    except Exception as exc:  # berkas rusak memunculkan beragam galat dari pembaca XML
        raise DataError(BROKEN) from exc
    return tables


def read_tables(extension: str, data: bytes) -> list[Table]:
    tables = _from_csv(data) if extension == "csv" else _from_xlsx(data)
    if not tables:
        raise DataError(EMPTY)
    return tables


def summary(table: Table) -> dict:
    """Yang disimpan bersama lampiran dan dilihat role: kolom, jumlah baris, contoh baris."""
    return {
        "name": table.name,
        "columns": [
            {"name": name, "type": kind}
            for name, kind in zip(table.columns, table.types, strict=True)
        ],
        "row_count": len(table.rows),
        "sample": [
            ["" if value is None else _plain(value)[:80] for value in row]
            for row in table.rows[:SAMPLE_ROWS]
        ],
    }
