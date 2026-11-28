"""Berkas surat: dari tugas sampai nomor, koreksi, dan pengaturan (kontrak bagian 18)."""

import io
import uuid

import pypdfium2 as pdfium
import pytest
from PIL import Image
from sqlalchemy import select

from app.models import Approval, AuditLog, LlmCall
from app.models.base import utcnow
from app.services.letters import documents, render
from app.services.llm.embedding import get_embedding_provider
from app.services.llm.generation import get_llm_provider
from tests.integration.tasks import create_task, detail, run
from tests.integration.world import add_agents

ADMIN = "/api/v1/admin"
SETTINGS = f"{ADMIN}/pengaturan/persuratan"


def one_page_pdf(_: bytes) -> bytes:
    document = pdfium.PdfDocument.new()
    document.new_page(595, 842)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


@pytest.fixture(autouse=True)
def fast_pdf(monkeypatch):
    """LibreOffice diuji di tes unit; di sini cukup PDF kosong satu halaman."""
    monkeypatch.setattr(render, "to_pdf", one_page_pdf)


async def make_letter(client, database, agent: str) -> tuple[str, dict]:
    task_id = await create_task(client, agent, title="Buat surat undangan rapat")
    await run(database, task_id, get_llm_provider())
    await documents.finalize(
        database, uuid.UUID(task_id), get_llm_provider(), get_embedding_provider()
    )
    url = f"{ADMIN}/tugas/{task_id}/berkas"
    response = await client.get(url)
    assert response.status_code == 200, response.text
    [document] = response.json()["data"]
    return url, document


async def test_letter_without_rules_gets_files_then_a_number(world, sign_in, database):
    [agent] = await add_agents(world, "a", "Rani")
    client = await sign_in("a_owner")
    viewer = await sign_in("a_viewer")

    url, document = await make_letter(client, database, agent)

    task_id = url.split("/")[-2]
    assert (await detail(client, task_id))["status"] == "completed"
    assert document["letter_type"] == "Surat Undangan"
    assert [s["kind"] for s in document["sources"]] == ["general"]
    assert (document["official"], document["processing"], document["number"]) == (
        False,
        False,
        None,
    )
    # Selesai tanpa persetujuan manusia: nomor menunggu tombol
    assert document["can_number"] is True
    item = f"{url}/{document['id']}"
    page = await client.get(document["pages"][0])
    word = await client.get(document["docx_url"])
    assert page.headers["content-type"] == "image/webp"
    assert word.content.startswith(b"PK") and ".docx" in word.headers["content-disposition"]
    assert (await viewer.post(f"{item}/nomor")).status_code == 403

    numbered = await client.post(f"{item}/nomor")
    again = await client.post(f"{item}/nomor")
    locked = await client.post(f"{item}/koreksi", json={"text": "tembusan taruh di kanan"})

    assert numbered.status_code == 200, numbered.text
    number = numbered.json()["data"]["number"]
    assert number.startswith("001/") and numbered.json()["data"]["version"] == 1
    assert (again.status_code, locked.status_code) == (409, 409)
    register = (await client.get(SETTINGS)).json()["data"]["registers"][0]
    assert register["issued"][0]["number"] == number and register["next_number"] == 2


async def test_approved_letter_is_numbered_automatically(world, sign_in, database):
    [agent] = await add_agents(world, "a", "Rani")
    client = await sign_in("a_owner")
    task_id = await create_task(client, agent, title="Buat surat undangan rapat")
    await run(database, task_id, get_llm_provider())
    async with database() as session:
        session.add(
            Approval(
                task_id=uuid.UUID(task_id),
                reason="requires_approval",
                question="Setujui?",
                requested_from_member_id=world.members["a_owner"].id,
                status="approved",
                decided_by_member_id=world.members["a_owner"].id,
                decided_at=utcnow(),
            )
        )
        await session.commit()

    await documents.finalize(
        database, uuid.UUID(task_id), get_llm_provider(), get_embedding_provider()
    )

    [document] = (await client.get(f"{ADMIN}/tugas/{task_id}/berkas")).json()["data"]
    assert document["number"] and not document["can_number"] and not document["processing"]


async def test_correction_changes_the_format_and_is_remembered(world, sign_in, database):
    [agent] = await add_agents(world, "a", "Rani")
    client = await sign_in("a_owner")
    url, document = await make_letter(client, database, agent)
    item = f"{url}/{document['id']}/koreksi"

    short = await client.post(item, json={"text": "ya"})
    unclear = await client.post(item, json={"text": "buat lebih bagus lagi"})
    done = await client.post(item, json={"text": "tembusan taruh di kanan bawah"})

    assert (short.status_code, unclear.status_code) == (422, 422), unclear.text
    assert done.status_code == 200, done.text
    assert done.json()["data"]["version"] == 2
    [note] = (await client.get(SETTINGS)).json()["data"]["formats"]
    assert [c["text"] for c in note["corrections"]] == ["tembusan taruh di kanan bawah"]
    async with database() as session:
        kinds = await session.scalars(select(LlmCall.kind).where(LlmCall.kind == "letter_format"))
        assert len(kinds.all()) == 2


async def test_settings_uploads_and_isolation(world, sign_in, database):
    [agent] = await add_agents(world, "a", "Rani")
    owner = await sign_in("a_owner")
    member = await sign_in("a_member")
    other = await sign_in("b_owner")
    url, document = await make_letter(owner, database, agent)
    picture = io.BytesIO()
    Image.new("RGB", (800, 120), "white").save(picture, "PNG")
    word = (await owner.get(document["docx_url"])).content
    kop = {"file": ("kop.png", picture.getvalue(), "image/png")}
    sample = {"file": ("undangan.docx", word, "application/octet-stream")}

    refused = await member.post(f"{SETTINGS}/kop", files=kop)
    saved = [
        await owner.post(f"{SETTINGS}/kop", files=kop),
        await owner.post(f"{SETTINGS}/kop", files=kop),
        await owner.post(f"{SETTINGS}/contoh", files=sample),
    ]
    broken = await owner.post(
        f"{SETTINGS}/contoh", files={"file": ("x.docx", b"bukan word", "x/y")}
    )

    assert refused.status_code == 403
    assert [r.status_code for r in saved] == [201, 201, 201], [r.text for r in saved]
    assert broken.status_code == 422
    data = (await member.get(SETTINGS)).json()["data"]
    assert len(data["letterheads"]) == 1 and len(data["samples"]) == 1
    assert data["can_edit"] is False
    image = await member.get(data["letterheads"][0]["image_url"])
    assert image.headers["content-type"] == "image/png"

    note, kop_id = data["formats"][0]["id"], data["letterheads"][0]["id"]
    foreign = [
        await other.get(url),
        await other.get(document["docx_url"]),
        await other.get(data["letterheads"][0]["image_url"]),
        await other.delete(f"{SETTINGS}/kop/{kop_id}"),
        await other.put(f"{SETTINGS}/format/{note}", json={"checked": True}),
        await other.delete(f"{SETTINGS}/contoh/{data['samples'][0]['id']}"),
    ]
    assert [r.status_code for r in foreign] == [404] * 6
    assert (await other.get(SETTINGS)).json()["data"]["formats"] == []

    await owner.post(f"{url}/{document['id']}/nomor")
    register_id = (await owner.get(SETTINGS)).json()["data"]["registers"][0]["id"]
    save = f"{SETTINGS}/register/{register_id}"
    bad = await owner.put(save, json={"pattern": "tanpa urut", "next_number": 1})
    reused = await owner.put(save, json={"pattern": "[urut]/[bulan]/[tahun]", "next_number": 1})
    fine = await owner.put(save, json={"pattern": "B/[urut]/[tahun]", "next_number": 40})
    assert [r.status_code for r in (bad, reused, fine)] == [422, 409, 200]
    assert (await owner.put(f"{SETTINGS}/format/{note}", json={"checked": True})).is_success
    [document] = (await owner.get(url)).json()["data"]
    assert document["format_checked"] is True
    assert (await owner.delete(f"{SETTINGS}/format/{note}")).is_success
    [document] = (await owner.get(url)).json()["data"]
    assert document["format_id"] is None and document["docx_url"]
    async with database() as session:
        codes = await session.scalars(
            select(AuditLog.action).where(AuditLog.action.like("surat.%")).distinct()
        )
        assert set(codes.all()) == {"surat.nomor", "surat.pengaturan"}
