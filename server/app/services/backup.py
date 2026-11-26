"""
Cadangan dan pemulihan data tanpa `pg_dump`.

Isi tiap tabel disalin dengan `COPY` ke satu arsip `.tar.gz`, bersama berkas unggahan. Skema
tidak ikut disimpan: skema berasal dari migrasi Alembic, dan pemulihan hanya diterima pada
database kosong dengan revisi skema yang sama.

Fungsi di sini tidak membuka atau menutup transaksi; pemanggil yang menentukannya.
"""

import datetime
import io
import json
import os
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

from psycopg import Connection, sql
from sqlalchemy import Table

import app.models  # noqa: F401
from app.db.base import Base

FORMAT = 1
UPLOADS = "uploads/"


class BackupError(Exception):
    pass


def tables() -> list[Table]:
    """Urutan yang aman untuk diisi: tabel yang dirujuk lebih dulu."""
    return list(Base.metadata.sorted_tables)


def _stored(table: Table) -> list:
    """Kolom turunan (mis. indeks pencarian) dihitung ulang database, jadi tidak disalin."""
    return [c for c in table.columns if c.computed is None]


def _columns(table: Table) -> sql.Composed:
    return sql.SQL(", ").join(sql.Identifier(c.name) for c in _stored(table))


def _revision(conn: Connection) -> str:
    row = conn.execute("SELECT version_num FROM alembic_version").fetchone()
    if row is None:
        raise BackupError("Database belum dimigrasi.")
    return row[0]


def _add(archive: tarfile.TarFile, name: str, data: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mtime = int(datetime.datetime.now(datetime.UTC).timestamp())
    info.mode = 0o600
    archive.addfile(info, io.BytesIO(data))


def dump(conn: Connection, destination: Path, upload_dir: Path) -> dict:
    """Tulis arsip cadangan. Arsip baru muncul di tempatnya setelah selesai utuh."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".sebagian")
    counts: dict[str, int] = {}
    try:
        # Berisi hash kata sandi: hanya pemilik berkas yang boleh membacanya
        handle = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(handle, "wb") as raw, tarfile.open(fileobj=raw, mode="w:gz") as archive:
            for table in tables():
                with tempfile.TemporaryFile() as buffer, conn.cursor() as cursor:
                    query = sql.SQL("COPY {} ({}) TO STDOUT").format(
                        sql.Identifier(table.name), _columns(table)
                    )
                    with cursor.copy(query) as copy:
                        for chunk in copy:
                            buffer.write(chunk)
                    counts[table.name] = cursor.rowcount
                    info = tarfile.TarInfo(f"tables/{table.name}.copy")
                    info.size = buffer.tell()
                    info.mode = 0o600
                    buffer.seek(0)
                    archive.addfile(info, buffer)
            files = 0
            if upload_dir.is_dir():
                for path in sorted(upload_dir.rglob("*")):
                    if path.is_file():
                        relative = path.relative_to(upload_dir).as_posix()
                        archive.add(path, arcname=f"{UPLOADS}{relative}", recursive=False)
                        files += 1
            meta = {
                "format": FORMAT,
                "revision": _revision(conn),
                "created_at": datetime.datetime.now(datetime.UTC).isoformat(),
                "rows": counts,
                "files": files,
            }
            _add(archive, "meta.json", json.dumps(meta, indent=2).encode())
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)
    return meta


def _deferred(order: list[Table], table: Table) -> list[str]:
    """Kolom yang merujuk tabel yang baru diisi kemudian."""
    position = {t.name: i for i, t in enumerate(order)}
    return [
        column.name
        for column in table.columns
        for key in column.foreign_keys
        if position[key.column.table.name] > position[table.name]
    ]


def _member(archive: tarfile.TarFile, name: str):
    try:
        found = archive.extractfile(name)
    except KeyError:
        found = None
    if found is None:
        raise BackupError(f"Arsip tidak lengkap: {name} tidak ada.")
    return found


def _copy_in(cursor, target: sql.Identifier, table: Table, source) -> None:
    query = sql.SQL("COPY {} ({}) FROM STDIN").format(target, _columns(table))
    with cursor.copy(query) as copy:
        while chunk := source.read(65536):
            copy.write(chunk)


def restore(conn: Connection, source: Path, upload_dir: Path) -> dict:
    """Isi database kosong dari arsip. Panggil di dalam satu transaksi."""
    order = tables()
    with tarfile.open(source, "r:gz") as archive:
        meta = json.load(_member(archive, "meta.json"))
        if meta.get("format") != FORMAT:
            raise BackupError("Format arsip tidak dikenal.")
        if meta["revision"] != (current := _revision(conn)):
            raise BackupError(
                f"Skema database ({current}) berbeda dari cadangan ({meta['revision']}). "
                f"Jalankan `alembic upgrade {meta['revision']}` pada database kosong."
            )
        for table in order:
            query = sql.SQL("SELECT 1 FROM {} LIMIT 1").format(sql.Identifier(table.name))
            if conn.execute(query).fetchone():
                raise BackupError(
                    f"Tabel {table.name} sudah berisi data. Pulihkan hanya ke database kosong."
                )

        later: list[tuple[Table, list[str], sql.Identifier]] = []
        with conn.cursor() as cursor:
            for table in order:
                target = sql.Identifier(table.name)
                data = _member(archive, f"tables/{table.name}.copy")
                deferred = _deferred(order, table)
                if not deferred:
                    _copy_in(cursor, target, table, data)
                    continue
                staging = sql.Identifier(f"pulih_{table.name}")
                cursor.execute(
                    sql.SQL("CREATE TEMP TABLE {} (LIKE {}) ON COMMIT DROP").format(staging, target)
                )
                _copy_in(cursor, staging, table, data)
                values = sql.SQL(", ").join(
                    sql.SQL("NULL") if c.name in deferred else sql.Identifier(c.name)
                    for c in _stored(table)
                )
                cursor.execute(
                    sql.SQL("INSERT INTO {} ({}) SELECT {} FROM {}").format(
                        target, _columns(table), values, staging
                    )
                )
                later.append((table, deferred, staging))

            for table, deferred, staging in later:
                assign = sql.SQL(", ").join(
                    sql.SQL("{c} = s.{c}").format(c=sql.Identifier(c)) for c in deferred
                )
                match = sql.SQL(" AND ").join(
                    sql.SQL("t.{c} = s.{c}").format(c=sql.Identifier(c.name))
                    for c in table.primary_key
                )
                cursor.execute(
                    sql.SQL("UPDATE {} AS t SET {} FROM {} AS s WHERE {}").format(
                        sql.Identifier(table.name), assign, staging, match
                    )
                )

            # Penomoran otomatis dilanjutkan dari angka tertinggi yang dipulihkan
            for table in order:
                for column in table.columns:
                    if column.identity is None:
                        continue
                    cursor.execute(
                        sql.SQL(
                            "SELECT setval(pg_get_serial_sequence({}, {}), "
                            "COALESCE(MAX({}), 0) + 1, false) FROM {}"
                        ).format(
                            sql.Literal(table.name),
                            sql.Literal(column.name),
                            sql.Identifier(column.name),
                            sql.Identifier(table.name),
                        )
                    )

        root = upload_dir.resolve()
        for item in archive.getmembers():
            if not item.name.startswith(UPLOADS) or not item.isfile():
                continue
            relative = PurePosixPath(item.name.removeprefix(UPLOADS))
            path = (root / relative).resolve()
            # Arsip yang diubah tangan tidak boleh menulis di luar folder unggahan
            if not path.is_relative_to(root):
                raise BackupError("Arsip memuat alamat berkas yang tidak aman.")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(_member(archive, item.name).read())
    return meta
