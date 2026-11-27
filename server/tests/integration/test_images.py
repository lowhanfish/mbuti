"""Halaman bergambar, berkas gambar, lampiran tugas, dan temuan (kontrak 16.5 dan 16.6)."""

import datetime
import io
import uuid

from PIL import Image, ImageDraw
from sqlalchemy import select, update

from app.api.v1.endpoints.admin.tugas.attachments import purge_expired
from app.core.config import settings
from app.models import DocumentSection, TaskAttachment
from app.models.base import utcnow
from app.services.llm.generation import MockLlm
from tests.integration.tasks import TASKS, create_task, detail, run
from tests.integration.test_knowledge import BASE, run_queue  # noqa: F401
from tests.integration.world import add_agents

ROLE = "/api/v1/admin/role"


def picture(kind: str = "PNG", color: str = "purple", size=(600, 800)) -> bytes:
    image = Image.new("RGB", size, "white")
    ImageDraw.Draw(image).rectangle((40, 40, size[0] - 40, size[1] // 2), fill=color)
    buffer = io.BytesIO()
    image.save(buffer, kind)
    return buffer.getvalue()


def scanned_pdf(pages: int) -> bytes:
    images = [
        Image.open(io.BytesIO(picture(color=c))) for c in ("purple", "orange", "teal")[:pages]
    ]
    buffer = io.BytesIO()
    images[0].save(buffer, "PDF", save_all=True, append_images=images[1:])
    return buffer.getvalue()


async def upload_attachment(client, data: bytes, name: str, mime: str):
    return await client.post(f"{TASKS}/lampiran", files={"file": (name, data, mime)})


async def test_image_document_and_page_images(world, sign_in, run_queue, monkeypatch):  # noqa: F811
    client = await sign_in("a_admin")
    response = await client.post(
        f"{BASE}/create",
        data={"scope": "organization", "title": "Poster panduan merek"},
        files={"file": ("poster.png", picture(), "image/png")},
    )
    assert response.status_code == 201, response.text
    image_doc = response.json()["data"]
    monkeypatch.setattr(settings, "VISION_PAGES_PER_DOCUMENT", 1)
    response = await client.post(
        f"{BASE}/create",
        data={"scope": "organization", "title": "Laporan hasil pindai"},
        files={"file": ("pindai.pdf", scanned_pdf(2), "application/pdf")},
    )
    assert response.status_code == 201, response.text
    scan_doc = response.json()["data"]
    await run_queue()

    detail_image = (await client.get(f"{BASE}/{image_doc['id']}")).json()["data"]
    version = detail_image["active_version"]
    assert version["media_kind"] == "image" and version["visual_pages"] == 1
    [section] = detail_image["sections"]
    assert section["render"] == "visual" and section["image_url"].endswith("/pages/1/image")

    image = await client.get(section["image_url"])
    assert image.status_code == 200 and image.headers["content-type"] == "image/webp"
    part = await client.get(section["image_url"], params={"box": "0,0,500,500"})
    assert part.status_code == 200 and len(part.content) < len(image.content)
    assert (await client.get(section["image_url"], params={"box": "9,9,1"})).status_code == 422

    scan = (await client.get(f"{BASE}/{scan_doc['id']}")).json()["data"]
    assert scan["active_version"]["media_kind"] == "pdf"
    assert (
        scan["active_version"]["visual_pages"],
        scan["active_version"]["visual_pages_over_limit"],
    ) == (1, 1)
    assert [s["render"] for s in scan["sections"]] == ["scan", "scan"]
    assert all(s["image_url"] for s in scan["sections"])

    hits = (await client.get(f"{BASE}/search", params={"q": "poster panduan merek"})).json()["data"]
    assert hits[0]["document_id"] == image_doc["id"] and hits[0]["image_url"]

    outsider = await sign_in("b_owner")
    assert (await outsider.get(section["image_url"])).status_code == 404

    models = (await client.get("/api/v1/admin/pengaturan/model-ai")).json()["data"]
    usage = {row["purpose"]: row["calls"] for row in models["usage_today"]}
    assert usage["vision_ingest"] == 2


async def test_attachments_upload_and_rules(world, sign_in, database):
    client = await sign_in("a_member")
    response = await upload_attachment(client, picture("JPEG"), "foto.jpg", "image/jpeg")
    assert response.status_code == 201, response.text
    photo = response.json()["data"]
    assert photo["page_count"] == 1 and photo["width"] == 600 and photo["height"] == 800
    page = await client.get(photo["pages"][0])
    assert page.status_code == 200 and page.headers["content-type"] == "image/webp"

    response = await upload_attachment(client, scanned_pdf(3), "laporan.pdf", "application/pdf")
    assert response.status_code == 201, response.text
    assert response.json()["data"]["page_count"] == 3

    wrong = await upload_attachment(client, b"teks biasa", "catatan.txt", "text/plain")
    assert wrong.status_code == 422
    fake = await upload_attachment(client, b"bukan gambar", "palsu.png", "image/png")
    assert fake.status_code == 422
    viewer = await sign_in("a_viewer")
    assert (await upload_attachment(viewer, picture(), "a.png", "image/png")).status_code == 403
    outsider = await sign_in("b_owner")
    assert (await outsider.get(photo["pages"][0])).status_code == 404

    # Lampiran yang tidak terpakai dibuang setelah kedaluwarsa
    async with database() as session:
        await session.execute(
            update(TaskAttachment)
            .where(TaskAttachment.id == uuid.UUID(photo["id"]))
            .values(expires_at=utcnow() - datetime.timedelta(minutes=1))
        )
        await session.commit()
    assert await purge_expired(database) == 1
    assert (await client.get(photo["pages"][0])).status_code == 404


async def test_task_reads_attachments_and_marks_findings(world, sign_in, database):
    admin = await sign_in("a_admin")
    [amir] = await add_agents(world, "a", "Amir")
    photo = (await upload_attachment(admin, picture(), "poster.png", "image/png")).json()["data"]

    task_id = await create_task(admin, amir, attachment_ids=[photo["id"]])
    again = await admin.post(
        f"{TASKS}/create",
        json={
            "title": "Tugas lain lagi",
            "entry_agent_id": amir,
            "budget_limit": 50_000,
            "attachment_ids": [photo["id"]],
        },
    )
    assert again.status_code == 422

    await run(database, task_id, MockLlm())
    task = await detail(admin, task_id)
    assert [a["id"] for a in task["attachments"]] == [photo["id"]]
    [step] = task["steps"]
    [finding] = step["findings"]
    assert finding["no"] == 1 and finding["box"] == [100, 100, 400, 900]
    assert finding["target"] == {"kind": "attachment", "attachment_id": photo["id"], "page_no": 1}
    assert finding["severity"] == "perlu_perbaikan" and finding["criterion"] is None


async def test_trial_with_attachment_and_page_readings(world, sign_in, run_queue, database):  # noqa: F811
    client = await sign_in("a_admin")
    [amir] = await add_agents(world, "a", "Amir")
    photo = (await upload_attachment(client, picture(), "poster.png", "image/png")).json()["data"]

    # Tanpa dokumen apa pun, lampiran tetap dibaca model
    response = await client.post(
        f"{ROLE}/{amir}/trial",
        json={"brief": "Periksa poster ini", "attachment_ids": [photo["id"]]},
    )
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["status"] == "done" and [a["id"] for a in result["attachments"]] == [photo["id"]]
    assert result["findings"][0]["target"]["attachment_id"] == photo["id"]
    assert "<gambar" in result["prompt_preview"]

    # Lampiran uji coba boleh dipakai lagi
    response = await client.post(
        f"{ROLE}/{amir}/trial", json={"brief": "Periksa lagi", "attachment_ids": [photo["id"]]}
    )
    assert response.status_code == 200

    # Halaman pengetahuan bergambar ikut dikirim; bacaannya disimpan sekali
    await client.post(
        f"{BASE}/create",
        data={"scope": "organization", "title": "Poster panduan merek"},
        files={"file": ("poster.png", picture(), "image/png")},
    )
    await run_queue()
    response = await client.post(f"{ROLE}/{amir}/trial", json={"brief": "poster panduan merek"})
    result = response.json()["data"]
    assert result["findings"][0]["target"]["kind"] == "document"
    assert result["findings"][0]["source_index"] == 1
    async with database() as session:
        readings = (await session.scalars(select(DocumentSection.visual_text))).all()
    assert readings == ["Bacaan tiruan G1."]
