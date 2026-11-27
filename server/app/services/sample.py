"""
Data contoh: alur "Penyusun Surat → Pemeriksa Surat → Persetujuan Kepala".

Dipakai skrip `scripts/data_contoh.py` dan tes ujung ke ujung. Semua isinya karangan.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.deps import CurrentMember
from app.api.v1.endpoints.admin.pengetahuan import service as documents
from app.api.v1.endpoints.admin.pengetahuan.schema import DocumentMeta
from app.api.v1.endpoints.admin.relasi import service as relations
from app.api.v1.endpoints.admin.relasi.schema import RelationCreate
from app.api.v1.endpoints.admin.role import service as roles
from app.api.v1.endpoints.admin.role.schema import RoleCreate, RoleUpdate
from app.api.v1.endpoints.admin.role.service import live_agents
from app.api.v1.endpoints.admin.unit import service as units
from app.api.v1.endpoints.admin.unit.schema import UnitWrite
from app.core.config import SERVER_DIR
from app.models import Agent

DOCUMENT = SERVER_DIR / "contoh" / "sop-surat-dinas.md"
WRITER, REVIEWER = "Rani", "Tegar"


class SampleExists(Exception):
    pass


async def seed(sessions: async_sessionmaker[AsyncSession], actor: CurrentMember) -> dict[str, str]:
    """Buat unit, dua role, relasi, dan dokumen. Mengembalikan ID yang dibuat."""
    organization_id = actor.organization_id
    async with sessions() as session:
        taken = await session.scalar(
            select(Agent.name).where(
                *live_agents(organization_id), Agent.name.in_((WRITER, REVIEWER))
            )
        )
        if taken:
            raise SampleExists(f"Role bernama {taken} sudah ada; data contoh tidak ditambahkan.")

    async with sessions() as session:
        unit = await units.create_unit(
            session,
            organization_id,
            actor.user.id,
            UnitWrite(
                name="Persuratan (contoh)",
                code="SRT",
                description="Menyusun dan memeriksa surat dinas.",
            ),
        )

    async def make(name: str, title: str, goal: str, **changes) -> str:
        async with sessions() as session:
            role = await roles.create_role(
                session,
                actor,
                RoleCreate(name=name, title=title, unit_id=unit.id, goal=goal),
            )
        async with sessions() as session:
            await roles.update_role(
                session,
                actor,
                role.id,
                RoleUpdate(status="active", owner_member_id=str(actor.membership.id), **changes),
            )
        return role.id

    writer = await make(
        WRITER,
        "Penyusun Surat Dinas",
        "Menyusun draf surat dinas yang sesuai pedoman, siap diperiksa.",
        instructions="1. Baca arahan.\n2. Susun draf surat singkat berdasarkan pedoman.\n"
        "3. Cantumkan rujukan.",
        input_spec=[{"key": "perihal", "label": "Perihal", "type": "short_text", "required": True}],
        acceptance_criteria=["Nomor surat sesuai pedoman", "Menyebut hari, tanggal, dan tempat"],
    )
    reviewer = await make(
        REVIEWER,
        "Pemeriksa Surat",
        "Memeriksa draf surat terhadap pedoman dan memberi catatan yang jelas.",
        instructions="Terima draf bila semua unsur wajib ada. Data yang belum diberikan boleh "
        "berupa isian kosong bertanda.",
    )

    for body in (
        RelationCreate(
            source_id=writer,
            target_id=reviewer,
            relation_type="review",
            payload_spec="references",
            max_revisions=2,
            label="Periksa draf",
        ),
        RelationCreate(
            source_id=reviewer,
            target_id=str(actor.membership.id),
            relation_type="escalate",
            expected_output="Setujui surat sebelum ditandatangani dan dikirim.",
            label="Persetujuan Kepala",
        ),
    ):
        async with sessions() as session:
            await relations.create_relation(session, actor, body)

    async with sessions() as session:
        document = await documents.create_document(
            session,
            actor,
            DocumentMeta(title="SOP Surat Dinas (contoh)", doc_type="sop", scope="organization"),
            DOCUMENT.name,
            DOCUMENT.read_bytes(),
        )
    return {"unit": unit.id, "writer": writer, "reviewer": reviewer, "document": document.id}
