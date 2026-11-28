"""
Pekerjaan aplikasi luar (antrean `browser`). Jalankan dengan `--concurrency` kecil: tiap
putaran membuka satu Chromium.
"""

import logging
import uuid

from app.services.browser import runner
from app.services.llm.generation import get_llm_provider
from app.workers.celery_app import celery_app
from app.workers.execution import _run

logger = logging.getLogger("mbuti.worker.browser")

# Termasuk menunggu kode OTP
SOFT_LIMIT_SECONDS = 15 * 60


@celery_app.task(
    name="app.workers.browser.execute_browser_run",
    soft_time_limit=SOFT_LIMIT_SECONDS,
    time_limit=SOFT_LIMIT_SECONDS + 60,
)
def execute_browser_run(run_id: str) -> None:
    follow_up = _run(lambda sessions: runner.execute(sessions, uuid.UUID(run_id), get_llm_provider))
    if follow_up:
        execute_browser_run.apply_async(args=[follow_up])


@celery_app.task(name="app.workers.browser.recover_browser_runs")
def recover_browser_runs() -> int:
    queued = _run(runner.recover)
    for run_id in queued:
        execute_browser_run.apply_async(args=[run_id])
    return len(queued)
