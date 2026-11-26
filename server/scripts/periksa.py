"""
Periksa kesehatan layanan. Keluar dengan kode 1 bila ada yang GAGAL.

    python -m scripts.periksa --cadangan /var/backups/mbuti

Bila `ALERT_EMAILS` diisi, pengelola diberi email saat ada yang gagal, pengingat selama masih
gagal, dan email saat pulih (app/services/alerts.py). `--tanpa-email` mematikannya untuk sekali
jalan, mis. saat memeriksa dengan tangan.
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from app.core.config import settings
from app.db.session import engine, session_factory
from app.services import alerts, monitor


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
    parser.add_argument("--tanpa-email", action="store_true", help="jangan kirim pemberitahuan")
    options = parser.parse_args(argv)
    logging.disable(logging.CRITICAL)
    findings = asyncio.run(collect(options.cadangan))
    for item in findings:
        print(f"{item.level:<10} {item.name:<14} {item.message}")
    if not options.tanpa_email:
        try:
            sent = alerts.notify(findings)
        except Exception as exc:
            print(f"Pemberitahuan email gagal dikirim ({type(exc).__name__}); dicoba lagi nanti.")
        else:
            if sent and settings.EMAIL_BACKEND == "console":
                print(f"Pemberitahuan ({sent}) hanya dicatat: EMAIL_BACKEND=console.")
            elif sent:
                print(f"Pemberitahuan email terkirim: {sent}.")
    return 1 if any(f.level == monitor.FAIL for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
