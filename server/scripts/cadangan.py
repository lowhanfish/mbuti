"""
Buat dan pulihkan cadangan database beserta berkas unggahan.

    python -m scripts.cadangan buat --tujuan /var/backups/mbuti --simpan 14
    python -m scripts.cadangan pulihkan /var/backups/mbuti/mbuti-20261128-0200.tar.gz

Arsip berisi seluruh data, termasuk hash kata sandi. Simpan di tempat yang aman dan salin
ke mesin lain.
"""

import argparse
import datetime
import sys
from pathlib import Path

import psycopg

from app.core.config import settings
from app.services.backup import BackupError, dump, restore

PATTERN = "mbuti-*.tar.gz"


def connect() -> psycopg.Connection:
    url = settings.get_database_url()
    options = url.translate_connect_args(username="user", database="dbname")
    return psycopg.connect(
        **options, **dict(url.query), connect_timeout=settings.DB_CONNECT_TIMEOUT
    )


def prune(folder: Path, keep: int) -> list[Path]:
    """Hapus arsip terlama; `keep` nol berarti simpan semuanya."""
    if keep <= 0:
        return []
    old = sorted(folder.glob(PATTERN))[:-keep]
    for path in old:
        path.unlink()
    return old


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cadangan database MBUTI.")
    commands = parser.add_subparsers(dest="command", required=True)
    make = commands.add_parser("buat", help="buat arsip baru")
    make.add_argument("--tujuan", type=Path, required=True, help="folder arsip")
    make.add_argument("--simpan", type=int, default=0, help="jumlah arsip terbaru yang disimpan")
    load = commands.add_parser("pulihkan", help="isi database kosong dari arsip")
    load.add_argument("arsip", type=Path)
    options = parser.parse_args(argv)

    try:
        with connect() as conn:
            if options.command == "buat":
                stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
                path = options.tujuan / f"mbuti-{stamp}.tar.gz"
                # Satu potret yang konsisten untuk semua tabel
                conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                meta = dump(conn, path, settings.UPLOAD_DIR)
                removed = prune(options.tujuan, options.simpan)
                print(
                    f"Cadangan dibuat: {path} ({sum(meta['rows'].values())} baris, "
                    f"{meta['files']} berkas). Arsip lama dihapus: {len(removed)}."
                )
            else:
                meta = restore(conn, options.arsip, settings.UPLOAD_DIR)
                print(
                    f"Dipulihkan {sum(meta['rows'].values())} baris dan {meta['files']} berkas "
                    f"dari cadangan {meta['created_at']}."
                )
    except BackupError as exc:
        print(f"Gagal: {exc}")
        return 1
    except (OSError, psycopg.Error) as exc:
        # Pesan galat database bisa memuat alamat server, jadi hanya jenisnya yang dicetak
        print(f"Gagal: {type(exc).__name__}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
