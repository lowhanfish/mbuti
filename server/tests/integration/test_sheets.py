"""Spreadsheet: dari lampiran data sampai unduh Excel (kontrak bagian 19)."""

import io
import uuid

import pytest
from openpyxl import load_workbook

from app.services.engine.execution import Providers, advance
from app.services.letters import documents
from app.services.llm.embedding import MockEmbedding, get_embedding_provider
from app.services.llm.generation import MockLlm, get_llm_provider
from app.services.sheets import build
from tests.integration.tasks import (
    TASKS,
    ScriptedLlm,
    create_task,
    detail,
    relate,
    review,
    run,
    work,
)
from tests.integration.test_images import upload_attachment
from tests.integration.world import add_agents

CSV = b"Bidang;Pagu\n" + b"".join(b"Bidang %d;%d\n" % (n, n * 1000) for n in range(1, 9))
DESIGN = {
    "sheets": [
        {
            "name": "Rekap",
            "source": "D1",
            "columns": [
                {"header": "Bidang", "source_column": "Bidang", "format": "text", "total": "none"},
                {"header": "Pagu", "source_column": "Pagu", "format": "currency", "total": "sum"},
            ],
        }
    ]
}


@pytest.fixture(autouse=True)
def without_libreoffice(monkeypatch):
    """LibreOffice diuji di tes unit."""
    monkeypatch.setattr(build, "recalculate", lambda _: None)


async def finish(database, task_id: str) -> None:
    await documents.finalize(
        database, uuid.UUID(task_id), get_llm_provider(), get_embedding_provider()
    )


async def test_data_attachment_becomes_a_spreadsheet(world, sign_in, database):
    client = await sign_in("a_owner")
    [maker, checker] = await add_agents(world, "a", "Rani", "Tegar")
    await relate(world, maker, "review", checker)
    broken = await upload_attachment(client, b"Judul;saja\n", "kosong.csv", "text/csv")
    uploaded = await upload_attachment(client, CSV, "pagu.csv", "text/csv")
    assert (broken.status_code, uploaded.status_code) == (422, 201), uploaded.text
    attachment = uploaded.json()["data"]
    assert attachment["table"] == [{"name": "Data", "columns": ["Bidang", "Pagu"], "row_count": 8}]
    assert (attachment["page_count"], attachment["pages"]) == (0, [])
    llm = ScriptedLlm(work(sources=[], sheet=DESIGN), review("approved"))

    task_id = await create_task(
        client, maker, title="Rekap pagu", attachment_ids=[attachment["id"]]
    )
    providers = Providers(llm, MockEmbedding())
    await advance(database, uuid.UUID(task_id), providers)
    await finish(database, task_id)
    await run(database, task_id, llm)
    await finish(database, task_id)

    assert (await detail(client, task_id))["status"] == "completed"
    # Hanya contoh baris yang dikirim ke model; pemeriksa menerima totalnya
    assert '<data nama="D1">' in llm.prompt(0) and "Bidang 8" not in llm.prompt(0)
    assert "sheet" in llm.calls[0][3]["properties"]
    assert "Rp 36.000" in llm.prompt(1)
    url = f"{TASKS}/{task_id}/berkas"
    [document] = (await client.get(url)).json()["data"]
    assert (document["kind"], document["origin"], document["processing"]) == (
        "sheet",
        "attachment",
        False,
    )
    assert document["source_files"] == ["pagu.csv"]
    assert document["sheets"][0]["row_count"] == 8
    assert document["sheets"][0]["rows"][-1]["cells"] == ["Jumlah seluruhnya", "Rp 36.000"]
    file = await client.get(document["xlsx_url"])
    assert ".xlsx" in file.headers["content-disposition"]
    assert load_workbook(io.BytesIO(file.content))["Rekap"]["B10"].value == "=SUBTOTAL(9,B2:B9)"
    item = f"{url}/{document['id']}"
    assert (await client.post(f"{item}/nomor")).status_code == 409
    correction = await client.post(f"{item}/koreksi", json={"text": "tembusan di kanan"})
    assert correction.status_code == 409
    outsider = await sign_in("b_owner")
    assert (await outsider.get(document["xlsx_url"])).status_code == 404


async def test_mock_model_designs_from_attached_data(world, sign_in, database):
    client = await sign_in("a_owner")
    [maker] = await add_agents(world, "a", "Rani")
    uploaded = await upload_attachment(client, CSV, "pagu.csv", "text/csv")

    task_id = await create_task(
        client, maker, title="Rekap pagu", attachment_ids=[uploaded.json()["data"]["id"]]
    )
    await run(database, task_id, MockLlm())
    await finish(database, task_id)

    [document] = (await client.get(f"{TASKS}/{task_id}/berkas")).json()["data"]
    assert [c["header"] for c in document["sheets"][0]["columns"]] == ["Bidang", "Pagu"]
