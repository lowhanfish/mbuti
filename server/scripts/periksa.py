"""
Periksa kesehatan layanan. Keluar dengan kode 1 bila ada yang GAGAL, sehingga penjadwal
(systemd timer, cron) bisa memberi tahu pengelola.

    python -m scripts.periksa --cadangan /var/backups/mbuti
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from app.core.config import settings
from app.db.session import engine, session_factory
from app.services import monitor


async def collect(backup_dir: Path | None) -> list[monitor.Finding]:
    findings: list[monitor.Finding] = []
    try:
        async with asyncio.timeout(30):
            async with session_factory() as session:
                findings += await monitor.check_database(session)
                findings += await monitor.check_work(session)
    except Exception as exc:
        findings.append(
            monitor.Finding(monitor.FAIL, "database", f"Gagal diperiksa ({type(exc).__name__}).")
        )
    finally:
        await engine.dispose()
    findings += monitor.check_queues()
    findings += monitor.check_workers()
    findings += monitor.check_disk(settings.UPLOAD_DIR)
    findings += monitor.check_backup(backup_dir)
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Periksa kesehatan layanan MBUTI.")
    parser.add_argument("--cadangan", type=Path, help="folder arsip yang umurnya ikut diperiksa")
    options = parser.parse_args(argv)
    logging.disable(logging.CRITICAL)
    findings = asyncio.run(collect(options.cadangan))
    for item in findings:
        print(f"{item.level:<10} {item.name:<14} {item.message}")
    return 1 if any(f.level == monitor.FAIL for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
