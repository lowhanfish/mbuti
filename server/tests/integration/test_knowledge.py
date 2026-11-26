"""Dokumen, olah, versi, pencarian, dan unduhan (kontrak bagian 5)."""

import uuid

import pytest

from app.core.config import settings
from app.services.knowledge.ingest import RetryLater, ingest_version
from app.services.llm.embedding import MockEmbedding
from app.services.llm.gemini_keys import GeminiUnavailable
from tests.integration.world import add_agents

BASE = "/api/v1/admin/pengetahuan"
ITEM_KEYS = {
    "id",
    "title",
    "description",
    "doc_type",
    "scope",
    "scope_id",
    "scope_name",
    "scope_color",
    "active_version",
    "version_count",
    "created_at",
    "updated_at",
}
VERSION_KEYS = {
    "id",
    "version_no",
    "file_name",
    "mime_type",
    "size_bytes",
    "sha256",
    "page_count",
    "is_active",
    "status",
    "progress",
    "error_message",
    "uploaded_by_name",
    "created_at",
}
HIT_KEYS = {
    "document_id",
    "document_title",
    "version_id",
    "version_no",
    "page_no",
    "heading",
    "snippet",
    "score",
}
LETTER = (
    b"# Undangan rapat\nSurat undangan rapat dikirim paling lambat tiga hari sebelumnya.\n"
    b"# Penomoran\nNomor surat berisi kode unit dan tahun."
)


def markdown(content: bytes = LETTER, name: str = "pedoman.md"):
    return {"file": (name, content, "text/markdown")}


@pytest.fixture
def run_queue(database, queued_versions):
    """Olah semua versi yang antre, seperti yang dilakukan worker."""

    async def run(provider=None):
        while queued_versions:
            await ingest_version(
                database, uuid.UUID(queued_versions.pop(0)), provider or MockEmbedding()
            )

    return run


async def upload(client, content=LETTER, name="pedoman.md", **fields):
    data = {"scope": "organization", **fields}
    response = await client.post(f"{BASE}/create", data=data, files=markdown(content, name))
    assert response.status_code == 201, response.text
    return response.json()["data"]


async def test_upload_is_processed_and_readable(world, sign_in, run_queue, upload_dir):
    client = await sign_in("a_admin")

    created = await upload(client, title="Pedoman Surat", doc_type="pedoman")
    assert set(created) == ITEM_KEYS and set(created["active_version"]) == VERSION_KEYS
    assert (created["active_version"]["status"], created["version_count"]) == ("queued", 1)
    assert len(list(upload_dir.rglob("*.md"))) == 1

    await run_queue()
    detail = (await client.get(f"{BASE}/{created['id']}")).json()["data"]
    version = detail["active_version"]
    assert (version["status"], version["progress"], version["page_count"]) == ("ready", 100, 2)
    assert version["uploaded_by_name"] == "A Admin"
    assert [s["heading"] for s in detail["sections"]] == ["Undangan rapat", "Penomoran"]
    assert detail["archived_at"] is None

    listing = (await client.get(f"{BASE}/read", params={"search": "pedoman"})).json()
    assert listing["total"] == 1
    assert listing["summary"] == {"queued": 0, "processing": 0, "ready": 1, "failed": 0}
    empty = (await client.get(f"{BASE}/read", params={"status": "failed"})).json()
    assert empty["total"] == 0


async def test_upload_validation(world, sign_in, monkeypatch, upload_dir):
    client = await sign_in("a_owner")
    cases = [
        ({"scope": "organization"}, markdown(b""), "Berkas kosong."),
        (
            {"scope": "organization"},
            {"file": ("palsu.pdf", b"bukan pdf", "application/pdf")},
            "Jenis berkas belum didukung. Gunakan PDF berteks, DOCX, TXT, atau MD.",
        ),
        ({"scope": "semua"}, markdown(), "Lingkup dokumen tidak valid."),
        (
            {"scope": "unit", "scope_id": world.unit_id("b")},
            markdown(),
            "Pilih unit pemilik dokumen.",
        ),
        ({"scope": "agent"}, markdown(), "Pilih role pemilik dokumen."),
        ({"scope": "organization", "title": "ab"}, markdown(), "Judul minimal 3 karakter."),
    ]
    for data, files, message in cases:
        response = await client.post(f"{BASE}/create", data=data, files=files)
        assert (response.status_code, response.json()["message"]) == (422, message), data

    missing = await client.post(f"{BASE}/create", data={"scope": "organization"})
    assert missing.json()["message"] == "Pilih berkas yang akan diunggah."

    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 10)
    large = await client.post(f"{BASE}/create", data={"scope": "organization"}, files=markdown())
    assert large.status_code == 422 and "melebihi" in large.json()["message"]
    assert list(upload_dir.rglob("*.*")) == []

    member = await sign_in("a_member")
    refused = await member.post(f"{BASE}/create", data={"scope": "organization"}, files=markdown())
    assert refused.status_code == 403


async def test_new_version_takes_over_only_when_ready(world, sign_in, run_queue):
    client = await sign_in("a_owner")
    document = await upload(client)
    await run_queue()
    url = f"{BASE}/{document['id']}/versions"

    added = await client.post(url, files=markdown(b"# Baru\nIsi pedoman yang baru."))
    assert added.status_code == 201, added.text
    versions = added.json()["data"]["versions"]
    assert [(v["version_no"], v["is_active"]) for v in versions] == [(2, False), (1, True)]

    duplicate = await client.post(url, files=markdown(b"# Baru\nIsi pedoman yang baru."))
    assert duplicate.status_code == 422
    not_ready = await client.put(f"{url}/{versions[0]['id']}/activate")
    assert not_ready.status_code == 409

    await run_queue()
    detail = (await client.get(f"{BASE}/{document['id']}")).json()["data"]
    assert detail["active_version"]["version_no"] == 2

    old = (await client.get(f"{url}/{versions[1]['id']}")).json()["data"]
    assert (old["is_active"], len(old["sections"])) == (False, 2)
    back = await client.put(f"{url}/{versions[1]['id']}/activate")
    assert back.json()["data"]["active_version"]["version_no"] == 1


async def test_failed_version_keeps_old_one_and_may_be_retried(world, sign_in, run_queue):
    client = await sign_in("a_owner")
    document = await upload(client)
    await run_queue()
    url = f"{BASE}/{document['id']}/versions"
    blank = {"file": ("kosong.txt", b"   \n  ", "text/plain")}

    await client.post(url, files=blank)
    await run_queue()
    detail = (await client.get(f"{BASE}/{document['id']}")).json()["data"]

    newest = detail["versions"][0]
    assert (newest["status"], newest["is_active"]) == ("failed", False)
    assert "tidak berisi teks" in newest["error_message"]
    assert detail["active_version"]["version_no"] == 1
    assert (await client.post(url, files=blank)).status_code == 201


async def test_quota_pauses_and_resumes_without_repeating_work(
    world, sign_in, database, queued_versions
):
    client = await sign_in("a_owner")
    document = await upload(client)
    version_id = uuid.UUID(queued_versions.pop())

    class Limited(MockEmbedding):
        def __init__(self, allowed):
            self.allowed, self.calls = allowed, 0

        async def embed_document(self, title, text):
            if self.calls >= self.allowed:
                raise GeminiUnavailable("kuota", 30)
            self.calls += 1
            return await super().embed_document(title, text)

    first = Limited(allowed=0)
    with pytest.raises(RetryLater) as pause:
        await ingest_version(database, version_id, first)
    assert pause.value.seconds == 30
    waiting = (await client.get(f"{BASE}/{document['id']}")).json()["data"]
    assert waiting["active_version"]["status"] == "queued"

    second = Limited(allowed=10)
    await ingest_version(database, version_id, second)
    # Dua potongan: tidak ada seksi ganda setelah diulang
    ready = (await client.get(f"{BASE}/{document['id']}")).json()["data"]
    assert (ready["active_version"]["status"], len(ready["sections"]), second.calls) == (
        "ready",
        2,
        2,
    )
    await ingest_version(database, version_id, second)
    assert second.calls == 2


async def test_search_respects_role_scope_and_organisation(world, sign_in, run_queue):
    client = await sign_in("a_owner")
    outsider = await sign_in("b_owner")
    rani, tegar = await add_agents(world, "a", "Rani", "Tegar")
    unit = world.unit_id("a")
    await client.put(f"/api/v1/admin/role/update/{tegar}", json={"unit_id": unit})
    await upload(client, b"# Umum\nAturan cuti bagi seluruh pegawai.", "umum.md")
    await upload(
        client,
        b"# Pribadi\nAturan cuti khusus penyusun.",
        "rani.md",
        scope="agent",
        scope_id=rani,
    )
    await upload(
        client, b"# Unit\nAturan cuti unit sekretariat.", "unit.md", scope="unit", scope_id=unit
    )
    await upload(outsider, b"# Asing\nAturan cuti organisasi lain.", "asing.md")
    await run_queue()
    # Dibiarkan antre: dokumen yang belum siap tidak boleh muncul di pencarian
    await upload(client, b"# Antre\nAturan cuti yang belum diolah.", "antre.md")

    async def titles(**params):
        response = await client.get(f"{BASE}/search", params={"q": "aturan cuti", **params})
        assert response.status_code == 200, response.text
        hits = response.json()["data"]
        assert all(set(hit) == HIT_KEYS for hit in hits)
        return {hit["document_title"] for hit in hits}

    assert await titles() == {"umum", "rani", "unit"}
    assert await titles(agent_id=rani) == {"umum", "rani"}
    assert await titles(agent_id=tegar) == {"umum"}
    await client.put(f"/api/v1/admin/role/update/{tegar}", json={"knowledge_scope": "unit"})
    assert await titles(agent_id=tegar) == {"umum", "unit"}
    await client.put(f"/api/v1/admin/role/update/{tegar}", json={"knowledge_scope": "organization"})
    assert await titles(agent_id=tegar) == {"umum", "rani", "unit"}

    roles = (await client.get("/api/v1/admin/role/read")).json()["data"]
    assert {r["name"]: r["document_count"] for r in roles} == {"Rani": 3, "Tegar": 4}
    listed = (await client.get(f"{BASE}/read", params={"agent_id": rani})).json()
    assert {d["title"] for d in listed["data"]} == {"umum", "rani", "antre"}
    assert (await client.get(f"{BASE}/search", params={"q": "di"})).json()["data"] == []


async def test_delete_and_owners_are_protected(world, sign_in, run_queue, upload_dir):
    client = await sign_in("a_owner")
    (rani,) = await add_agents(world, "a", "Rani")
    unit = world.unit_id("a")
    owned = await upload(client, name="rani.md", scope="agent", scope_id=rani)
    shared = await upload(client, name="unit.md", scope="unit", scope_id=unit)
    assert shared["scope_name"] == "Sekretariat"
    assert owned["scope_name"] == "Rani · Jabatan Rani"
    await run_queue()

    role_blocked = await client.delete(f"/api/v1/admin/role/delete/{rani}")
    unit_blocked = await client.delete(f"/api/v1/admin/unit/delete/{unit}")
    assert (role_blocked.status_code, unit_blocked.status_code) == (409, 409)

    moved = await client.put(
        f"{BASE}/update/{owned['id']}", json={"title": "Dipindah", "scope": "organization"}
    )
    assert (moved.json()["data"]["scope"], moved.json()["data"]["scope_id"]) == (
        "organization",
        None,
    )
    assert (await client.delete(f"{BASE}/delete/{shared['id']}")).status_code == 200
    assert (await client.get(f"{BASE}/{shared['id']}")).status_code == 404
    assert len(list(upload_dir.rglob("*.md"))) == 1
    assert (await client.delete(f"/api/v1/admin/role/delete/{rani}")).status_code == 200
    assert (await client.delete(f"/api/v1/admin/unit/delete/{unit}")).status_code == 200


async def test_download_and_isolation(world, sign_in, run_queue):
    owner = await sign_in("a_owner")
    document = await upload(owner, name="Pedoman Surat 2026.md")
    await run_queue()
    version = document["active_version"]["id"]
    url = f"{BASE}/{document['id']}/versions/{version}"

    viewer = await sign_in("a_viewer")
    download = await viewer.get(f"{url}/file")
    assert download.content == LETTER
    assert download.headers["content-disposition"].startswith("attachment")
    assert download.headers["x-content-type-options"] == "nosniff"

    outsider = await sign_in("b_owner")
    statuses = [
        (await outsider.get(f"{BASE}/{document['id']}")).status_code,
        (await outsider.get(url)).status_code,
        (await outsider.get(f"{url}/file")).status_code,
        (await outsider.put(f"{url}/activate")).status_code,
        (await outsider.delete(f"{BASE}/delete/{document['id']}")).status_code,
        (await outsider.post(f"{BASE}/{document['id']}/versions", files=markdown())).status_code,
    ]
    assert statuses == [404] * 6
    assert (await outsider.get(f"{BASE}/read")).json()["total"] == 0
