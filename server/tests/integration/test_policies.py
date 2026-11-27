"""Pustaka Kebijakan & Aturan dan urutan rujukan (kontrak 16.4)."""

import datetime

from tests.integration.test_knowledge import BASE, run_queue, upload  # noqa: F401
from tests.integration.world import add_agents

ROLE = "/api/v1/admin/role"
POLICY_TEXT = (
    b"# Persetujuan surat\nSurat undangan rapat wajib disetujui kepala unit sebelum dikirim."
)
GUIDE_TEXT = (
    b"# Undangan rapat\nSurat undangan rapat dikirim tiga hari sebelum rapat oleh sekretariat."
)


async def upload_policy(client, content=POLICY_TEXT, name="kebijakan.md", **fields):
    data = {
        "category": "policy",
        "policy_kind": "kebijakan",
        "reference_no": " KEP-07/2026 ",
        "issuer": "Pimpinan",
        **fields,
    }
    return await upload(client, content, name, **data)


async def test_policy_upload_update_and_filters(world, sign_in):
    client = await sign_in("a_admin")

    policy = await upload_policy(client, effective_from="2026-01-01")
    assert policy["category"] == "policy"
    assert policy["policy"] == {
        "kind": "kebijakan",
        "reference_no": "KEP-07/2026",
        "issuer": "Pimpinan",
        "effective_from": "2026-01-01",
        "effective_until": None,
        "status": "berlaku",
        "in_force": True,
    }
    plain = await upload(client, GUIDE_TEXT, "pedoman.md")
    assert plain["category"] == "knowledge" and plain["policy"] is None

    response = await client.post(
        f"{BASE}/create",
        data={
            "scope": "organization",
            "category": "policy",
            "effective_from": "2026-05-01",
            "effective_until": "2026-01-01",
        },
        files={"file": ("salah.md", POLICY_TEXT + b" ", "text/markdown")},
    )
    assert response.status_code == 422

    listed = await client.get(f"{BASE}/read", params={"category": "policy"})
    assert [d["id"] for d in listed.json()["data"]] == [policy["id"]]
    others = await client.get(f"{BASE}/read", params={"category": "knowledge,formation,qa,web"})
    assert [d["id"] for d in others.json()["data"]] == [plain["id"]]

    response = await client.put(
        f"{BASE}/update/{policy['id']}",
        json={
            "title": policy["title"],
            "doc_type": "regulasi",
            "scope": "organization",
            "policy": {"kind": "peraturan", "status": "dicabut", "reference_no": "P-1"},
        },
    )
    assert response.status_code == 200, response.text
    updated = response.json()["data"]["policy"]
    assert updated["kind"] == "peraturan" and updated["status"] == "dicabut"
    assert updated["in_force"] is False

    # Keterangan kebijakan diabaikan untuk dokumen biasa
    response = await client.put(
        f"{BASE}/update/{plain['id']}",
        json={"title": plain["title"], "scope": "organization", "policy": {"kind": "kebijakan"}},
    )
    assert response.json()["data"]["policy"] is None


async def test_policies_come_first_and_only_while_in_force(world, sign_in, run_queue):  # noqa: F811
    client = await sign_in("a_admin")
    guide = await upload(client, GUIDE_TEXT, "pedoman.md")
    policy = await upload_policy(client)
    next_year = (datetime.date.today() + datetime.timedelta(days=400)).isoformat()
    future = await upload_policy(
        client, POLICY_TEXT + b" Berlaku tahun depan.", "baru.md", effective_from=next_year
    )
    await run_queue()

    hits = (await client.get(f"{BASE}/search", params={"q": "surat undangan rapat"})).json()["data"]
    assert [h["document_id"] for h in hits] == [policy["id"], guide["id"]]
    assert [h["source_kind"] for h in hits] == ["policy", "document"]
    assert future["id"] not in {h["document_id"] for h in hits}

    [rani] = await add_agents(world, "a", "Rani")
    result = (
        await client.post(f"{ROLE}/{rani}/trial", json={"brief": "surat undangan rapat"})
    ).json()
    preview = result["data"]["prompt_preview"]
    assert preview.index("ATURAN ORGANISASI") < preview.index("DOKUMEN\n")
    assert [c["source_kind"] for c in result["data"]["citations"]] == ["policy"]

    # Dicabut: tidak lagi menjadi dasar
    await client.put(
        f"{BASE}/update/{policy['id']}",
        json={"title": policy["title"], "scope": "organization", "policy": {"status": "dicabut"}},
    )
    hits = (await client.get(f"{BASE}/search", params={"q": "surat undangan rapat"})).json()["data"]
    assert [h["document_id"] for h in hits] == [guide["id"]]
