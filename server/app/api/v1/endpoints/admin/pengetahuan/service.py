import asyncio
import datetime
import hashlib
import logging
import uuid
from collections.abc import Iterable
from pathlib import Path, PurePosixPath

from sqlalchemy import delete, func, literal, or_, select, update
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.deps import CurrentMember
from app.api.v1.common import Paging, like_pattern, parse_id
from app.api.v1.endpoints.admin.pengetahuan.schema import (
    DocumentDetail,
    DocumentItem,
    DocumentMeta,
    IngestionSummary,
    PolicyFields,
    PolicyInfo,
    SearchHit,
    Section,
    Version,
    VersionDetail,
    hit_to_schema,
)
from app.api.v1.endpoints.admin.role.service import live_agents
from app.core.config import settings
from app.core.exceptions import ConflictException, NotFoundException, UnprocessableEntityException
from app.db.transaction import commit_or_raise_unique_conflict
from app.models import (
    Agent,
    Citation,
    Document,
    DocumentSection,
    DocumentVersion,
    Membership,
    Unit,
    User,
)
from app.models.base import utcnow
from app.services.appearance import UNIT_COLOR_HEX
from app.services.knowledge import storage
from app.services.knowledge.extract import MIME_TYPES, ExtractionError, detect_type
from app.services.knowledge.scope import visible_to
from app.services.knowledge.search import local_today, policy_in_force, search_documents
from app.services.llm.embedding import get_embedding_provider
from app.services.organisation import lock_organization, require_unit
from app.workers.ingestion import process_version

logger = logging.getLogger("mbuti.documents")

NOT_FOUND = "Dokumen tidak ditemukan."
VERSION_NOT_FOUND = "Versi tidak ditemukan."
DUPLICATE_FILE = "Berkas ini sama persis dengan versi yang sudah ada."
QUEUE_DOWN = "Antrean pengolahan tidak tersedia. Unggah ulang setelah layanan pulih."


CATEGORIES = ("knowledge", "policy", "formation", "qa", "web")
SYSTEM_DOCUMENT = (
    "Hasil tanya jawab disusun sistem dan tidak bisa diubah. Ubah lewat pembentukan role."
)


def _live(organization_id: uuid.UUID):
    return (Document.organization_id == organization_id, Document.deleted_at.is_(None))


async def _agent_filter(session: AsyncSession, organization_id: uuid.UUID, agent_id: str):
    agent = await session.scalar(
        select(Agent).where(
            Agent.id == parse_id(agent_id, "Role tidak ditemukan."), *live_agents(organization_id)
        )
    )
    if agent is None:
        raise NotFoundException("Role tidak ditemukan.")
    return visible_to(
        literal(agent.knowledge_scope),
        literal(agent.id, UUID(as_uuid=True)),
        literal(agent.unit_id, UUID(as_uuid=True)),
    )


async def _versions(
    session: AsyncSession, document_ids: Iterable[uuid.UUID], active_only: bool = False
) -> dict[uuid.UUID, list[tuple[DocumentVersion, Version]]]:
    """Versi tiap dokumen, terbaru lebih dulu, beserta nama pengunggahnya."""
    uploader = aliased(Membership)
    query = (
        select(DocumentVersion, User.full_name)
        .outerjoin(uploader, uploader.id == DocumentVersion.uploaded_by_member_id)
        .outerjoin(User, User.id == uploader.user_id)
        .where(DocumentVersion.document_id.in_(list(document_ids)))
        .order_by(DocumentVersion.version_no.desc())
    )
    if active_only:
        query = query.where(DocumentVersion.is_active.is_(True))
    result: dict[uuid.UUID, list[tuple[DocumentVersion, Version]]] = {}
    for version, uploader_name in await session.execute(query):
        item = Version(
            id=str(version.id),
            version_no=version.version_no,
            file_name=version.file_name,
            mime_type=version.mime_type,
            size_bytes=version.size_bytes,
            sha256=version.sha256,
            page_count=version.page_count,
            is_active=version.is_active,
            status=version.status,
            progress=version.progress,
            error_message=version.error_message if version.status == "failed" else None,
            uploaded_by_name=uploader_name,
            media_kind="pdf" if version.mime_type == "application/pdf" else "text",
            created_at=version.created_at,
        )
        result.setdefault(version.document_id, []).append((version, item))
    return result


def _items_query(*filters):
    version_count = (
        select(func.count())
        .select_from(DocumentVersion)
        .where(DocumentVersion.document_id == Document.id)
        .correlate(Document)
        .scalar_subquery()
    )
    return (
        select(
            Document,
            Unit.name.label("unit_name"),
            Unit.color.label("unit_color"),
            Agent.name.label("agent_name"),
            Agent.title.label("agent_title"),
            Agent.avatar.label("agent_avatar"),
            version_count.label("version_count"),
        )
        .outerjoin(Unit, Unit.id == Document.unit_id)
        .outerjoin(Agent, Agent.id == Document.agent_id)
        .where(*filters)
    )


def _policy(document: Document, today: datetime.date) -> PolicyInfo | None:
    if document.category != "policy" or document.policy_status is None:
        return None
    return PolicyInfo(
        kind=document.policy_kind or "lainnya",
        reference_no=document.reference_no,
        issuer=document.issuer,
        effective_from=document.effective_from,
        effective_until=document.effective_until,
        status=document.policy_status,
        in_force=policy_in_force(document, today),
    )


def _policy_columns(policy: PolicyFields | None) -> dict:
    policy = policy or PolicyFields()
    return {
        "policy_kind": policy.kind,
        "reference_no": " ".join(policy.reference_no.split()),
        "issuer": " ".join(policy.issuer.split()),
        "effective_from": policy.effective_from,
        "effective_until": policy.effective_until,
        "policy_status": policy.status,
    }


def _to_item(row, active: Version | None, today: datetime.date) -> DocumentItem:
    document: Document = row.Document
    scope_id = scope_name = scope_color = None
    if document.scope == "unit" and document.unit_id:
        scope_id, scope_name = str(document.unit_id), row.unit_name
        scope_color = UNIT_COLOR_HEX.get(row.unit_color) if row.unit_color else None
    elif document.scope == "agent" and document.agent_id:
        scope_id = str(document.agent_id)
        scope_name = f"{row.agent_name} · {row.agent_title}" if row.agent_name else None
        scope_color = (row.agent_avatar or {}).get("shirt")
    return DocumentItem(
        id=str(document.id),
        title=document.title,
        description=document.description,
        doc_type=document.doc_type,
        scope=document.scope,
        scope_id=scope_id,
        scope_name=scope_name,
        scope_color=scope_color,
        active_version=active,
        version_count=row.version_count,
        category=document.category,
        policy=_policy(document, today),
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


async def _item(session: AsyncSession, document_id: uuid.UUID) -> DocumentItem:
    row = (await session.execute(_items_query(Document.id == document_id))).one()
    active = (await _versions(session, [document_id], active_only=True)).get(document_id)
    today = await local_today(session, row.Document.organization_id)
    return _to_item(row, active[0][1] if active else None, today)


async def read_documents(
    session: AsyncSession,
    organization_id: uuid.UUID,
    search: str,
    scope: str,
    scope_id: str,
    doc_type: str,
    status: str,
    agent_id: str,
    page: Paging,
    category: str = "",
) -> tuple[int, list[DocumentItem], IngestionSummary]:
    base = [*_live(organization_id)]
    if agent_id:
        base.append(await _agent_filter(session, organization_id, agent_id))
    # Satu atau beberapa kategori dipisah koma; nilai yang tidak dikenal diabaikan (16.4)
    categories = [c for c in category.split(",") if c in CATEGORIES]
    if categories:
        base.append(Document.category.in_(categories))
    active = aliased(DocumentVersion)
    on_active = (active.document_id == Document.id) & active.is_active.is_(True)

    # Ringkasan mengikuti saringan role saja
    counts = await session.execute(
        select(active.status, func.count())
        .select_from(Document)
        .join(active, on_active)
        .where(*base)
        .group_by(active.status)
    )
    summary = IngestionSummary(**dict(counts.all()))

    filters = list(base)
    if search.strip():
        pattern = like_pattern(search.strip())
        columns = (Document.title, Document.description, active.file_name)
        filters.append(or_(*(c.ilike(pattern, escape="\\") for c in columns)))
    if scope:
        filters.append(Document.scope == scope)
    if scope_id:
        try:
            wanted = uuid.UUID(scope_id)
        except ValueError:
            return 0, [], summary
        filters.append(or_(Document.unit_id == wanted, Document.agent_id == wanted))
    if doc_type:
        filters.append(Document.doc_type == doc_type)
    if status:
        filters.append(active.status == status)

    query = _items_query(*filters).outerjoin(active, on_active)
    total = await session.scalar(
        select(func.count()).select_from(Document).outerjoin(active, on_active).where(*filters)
    )
    rows = (
        await session.execute(
            query.order_by(Document.updated_at.desc(), Document.id)
            .offset(page.skip)
            .limit(page.limit)
        )
    ).all()
    versions = await _versions(session, [r.Document.id for r in rows], active_only=True)
    today = await local_today(session, organization_id)
    items = [
        _to_item(r, versions[r.Document.id][0][1] if r.Document.id in versions else None, today)
        for r in rows
    ]
    return total, items, summary


async def search(
    session: AsyncSession, organization_id: uuid.UUID, query: str, agent_id: str
) -> list[SearchHit]:
    visibility = await _agent_filter(session, organization_id, agent_id) if agent_id else None
    hits = await search_documents(
        session, organization_id, query.strip()[:300], get_embedding_provider(), visibility
    )
    return [hit_to_schema(hit) for hit in hits]


def _not_system(document: Document) -> None:
    if document.category == "qa":
        raise ConflictException(SYSTEM_DOCUMENT)


async def owns_role(session: AsyncSession, member: CurrentMember, role_id: str) -> bool:
    """Anggota ini penanggung jawab role tersebut di organisasinya."""
    try:
        wanted = uuid.UUID(role_id)
    except ValueError:
        return False
    owner = await session.scalar(
        select(Agent.owner_member_id).where(
            Agent.id == wanted, *live_agents(member.organization_id)
        )
    )
    return owner == member.membership.id


async def _get(
    session: AsyncSession, organization_id: uuid.UUID, document_id: str, include_deleted=False
) -> Document:
    filters = [
        Document.id == parse_id(document_id, NOT_FOUND),
        Document.organization_id == organization_id,
    ]
    if not include_deleted:
        filters.append(Document.deleted_at.is_(None))
    document = await session.scalar(select(Document).where(*filters))
    if document is None:
        raise NotFoundException(NOT_FOUND)
    return document


async def _sections(session: AsyncSession, version: DocumentVersion | None) -> list[Section]:
    """Halaman baru bisa dibaca setelah versinya selesai diolah."""
    if version is None or version.status != "ready":
        return []
    rows = await session.scalars(
        select(DocumentSection)
        .where(DocumentSection.version_id == version.id)
        .order_by(DocumentSection.page_no)
    )
    return [Section(page_no=s.page_no, heading=s.heading, text=s.text) for s in rows]


async def _detail(session: AsyncSession, document: Document) -> DocumentDetail:
    row = (await session.execute(_items_query(Document.id == document.id))).one()
    versions = (await _versions(session, [document.id])).get(document.id, [])
    active = next((pair for pair in versions if pair[0].is_active), None)
    item = _to_item(
        row, active[1] if active else None, await local_today(session, document.organization_id)
    )
    return DocumentDetail(
        **item.model_dump(),
        versions=[pair[1] for pair in versions],
        sections=await _sections(session, active[0] if active else None),
        archived_at=document.deleted_at,
    )


async def read_document(
    session: AsyncSession, organization_id: uuid.UUID, document_id: str
) -> DocumentDetail:
    return await _detail(
        session, await _get(session, organization_id, document_id, include_deleted=True)
    )


async def _version(
    session: AsyncSession, organization_id: uuid.UUID, document_id: str, version_id: str
) -> DocumentVersion:
    # Termasuk dokumen yang diarsipkan, agar rujukan lama tetap bisa dibuka
    document = await _get(session, organization_id, document_id, include_deleted=True)
    version = await session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == parse_id(version_id, VERSION_NOT_FOUND),
            DocumentVersion.document_id == document.id,
        )
    )
    if version is None:
        raise NotFoundException(VERSION_NOT_FOUND)
    return version


async def read_version(
    session: AsyncSession, organization_id: uuid.UUID, document_id: str, version_id: str
) -> VersionDetail:
    version = await _version(session, organization_id, document_id, version_id)
    pairs = (await _versions(session, [version.document_id]))[version.document_id]
    item = next(pair[1] for pair in pairs if pair[0].id == version.id)
    return VersionDetail(**item.model_dump(), sections=await _sections(session, version))


async def version_file(
    session: AsyncSession, organization_id: uuid.UUID, document_id: str, version_id: str
) -> tuple[Path, str, str]:
    version = await _version(session, organization_id, document_id, version_id)
    path = storage.path_of(version.storage_path)
    if not path.is_file():
        raise NotFoundException("Berkas tidak ditemukan di server.")
    return path, version.mime_type, version.file_name


async def _scope_columns(
    session: AsyncSession, organization_id: uuid.UUID, scope: str, scope_id: str | None
) -> dict:
    columns = {"scope": scope, "unit_id": None, "agent_id": None}
    if scope == "unit":
        message = "Pilih unit pemilik dokumen."
        columns["unit_id"] = await require_unit(session, organization_id, scope_id, message)
        if columns["unit_id"] is None:
            raise UnprocessableEntityException(message)
    elif scope == "agent":
        message = "Pilih role pemilik dokumen."
        try:
            wanted = uuid.UUID(scope_id or "")
        except ValueError:
            raise UnprocessableEntityException(message) from None
        columns["agent_id"] = await session.scalar(
            select(Agent.id).where(Agent.id == wanted, *live_agents(organization_id))
        )
        if columns["agent_id"] is None:
            raise UnprocessableEntityException(message)
    return columns


def read_upload(file_name: str, data: bytes) -> tuple[str, str]:
    """Periksa ukuran dan jenis; kembalikan (ekstensi, nama berkas yang dibersihkan)."""
    if not data:
        raise UnprocessableEntityException("Berkas kosong.")
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise UnprocessableEntityException(
            f"Ukuran berkas melebihi {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )
    # Hanya nama dasar, tanpa karakter kendali
    name = PurePosixPath(file_name.replace("\\", "/")).name
    name = "".join(c for c in name if c.isprintable()).strip()[-200:] or "berkas"
    try:
        return detect_type(name, data), name
    except ExtractionError as exc:
        raise UnprocessableEntityException(str(exc)) from exc


async def _enqueue(session: AsyncSession, version_id: uuid.UUID) -> None:
    try:
        await asyncio.to_thread(
            process_version.apply_async,
            args=[str(version_id)],
            retry_policy={"max_retries": 1, "interval_start": 0.2},
        )
    except Exception as exc:
        logger.error("Antrean olah dokumen tidak tersedia: %s", type(exc).__name__)
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.id == version_id)
            .values(status="failed", activate_when_ready=False, error_message=QUEUE_DOWN)
        )
        await session.commit()


async def _add_version(
    session: AsyncSession,
    actor: CurrentMember,
    document: Document,
    file_name: str,
    data: bytes,
) -> uuid.UUID:
    """Simpan berkas sebagai versi baru lalu commit. Organisasi sudah dikunci pemanggil."""
    extension, name = read_upload(file_name, data)
    digest = hashlib.sha256(data).hexdigest()
    existing = (
        await session.execute(
            select(
                DocumentVersion.version_no,
                DocumentVersion.sha256,
                DocumentVersion.status,
                DocumentVersion.is_active,
            ).where(DocumentVersion.document_id == document.id)
        )
    ).all()
    if any(v.sha256 == digest and v.status != "failed" for v in existing):
        raise UnprocessableEntityException(DUPLICATE_FILE)

    # Selama versi aktif masih bisa dipakai, versi baru menunggu sampai selesai diolah
    current = next((v for v in existing if v.is_active), None)
    waits = current is not None and current.status == "ready"
    if not waits and current is not None:
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.document_id == document.id)
            .values(is_active=False)
        )

    relative = await asyncio.to_thread(storage.save, actor.organization_id, extension, data)
    version = DocumentVersion(
        id=uuid.uuid4(),
        document_id=document.id,
        version_no=max((v.version_no for v in existing), default=0) + 1,
        file_name=name,
        storage_path=relative,
        mime_type=MIME_TYPES[extension],
        size_bytes=len(data),
        sha256=digest,
        is_active=not waits,
        activate_when_ready=waits,
        uploaded_by_member_id=actor.membership.id,
    )
    session.add(version)
    document.updated_at = utcnow()
    try:
        await commit_or_raise_unique_conflict(session, DUPLICATE_FILE)
    except Exception:
        storage.delete(relative)
        raise
    return version.id


async def create_document(
    session: AsyncSession,
    actor: CurrentMember,
    meta: DocumentMeta,
    file_name: str,
    data: bytes,
    category: str = "knowledge",
) -> DocumentItem:
    if meta.doc_type == "uraian_jabatan":
        category = "formation"
    organization_id = actor.organization_id
    read_upload(file_name, data)
    await lock_organization(session, organization_id)
    document = Document(
        id=uuid.uuid4(),
        organization_id=organization_id,
        title=meta.title,
        description=meta.description,
        doc_type=meta.doc_type,
        category=category,
        **(_policy_columns(meta.policy) if category == "policy" else {}),
        created_by=actor.user.id,
        **await _scope_columns(session, organization_id, meta.scope, meta.scope_id),
    )
    session.add(document)
    await session.flush()
    version_id = await _add_version(session, actor, document, file_name, data)
    await _enqueue(session, version_id)
    return await _item(session, document.id)


async def add_version(
    session: AsyncSession, actor: CurrentMember, document_id: str, file_name: str, data: bytes
) -> tuple[DocumentDetail, int]:
    await lock_organization(session, actor.organization_id)
    document = await _get(session, actor.organization_id, document_id)
    _not_system(document)
    version_id = await _add_version(session, actor, document, file_name, data)
    await _enqueue(session, version_id)
    detail = await _detail(session, document)
    return detail, next(v.version_no for v in detail.versions if v.id == str(version_id))


async def activate_version(
    session: AsyncSession, organization_id: uuid.UUID, document_id: str, version_id: str
) -> tuple[DocumentDetail, int]:
    await lock_organization(session, organization_id)
    document = await _get(session, organization_id, document_id)
    version = await _version(session, organization_id, document_id, version_id)
    if version.status != "ready":
        raise ConflictException("Hanya versi yang sudah siap yang bisa diaktifkan.")
    # Dinonaktifkan dulu: hanya boleh ada satu versi aktif
    await session.execute(
        update(DocumentVersion)
        .where(DocumentVersion.document_id == document.id, DocumentVersion.id != version.id)
        .values(is_active=False)
    )
    version.is_active = True
    document.updated_at = utcnow()
    await session.commit()
    return await _detail(session, document), version.version_no


async def update_document(
    session: AsyncSession, organization_id: uuid.UUID, document_id: str, meta: DocumentMeta
) -> DocumentDetail:
    await lock_organization(session, organization_id)
    document = await _get(session, organization_id, document_id)
    _not_system(document)
    columns = await _scope_columns(session, organization_id, meta.scope, meta.scope_id)
    # Kategori tidak berubah lewat update; keterangan kebijakan hanya untuk dokumen kebijakan
    if document.category == "policy" and meta.policy is not None:
        columns.update(_policy_columns(meta.policy))
    for field, value in {
        "title": meta.title,
        "description": meta.description,
        "doc_type": meta.doc_type,
        **columns,
    }.items():
        setattr(document, field, value)
    await session.commit()
    return await _detail(session, document)


async def delete_document(
    session: AsyncSession, organization_id: uuid.UUID, document_id: str
) -> bool:
    """True bila diarsipkan, False bila dihapus permanen."""
    await lock_organization(session, organization_id)
    document = await _get(session, organization_id, document_id)
    _not_system(document)
    # Dokumen yang pernah dirujuk hasil tugas diarsipkan agar rujukannya tetap bisa dibuka
    if await session.scalar(
        select(Citation.id).where(Citation.document_id == document.id).limit(1)
    ):
        document.deleted_at = utcnow()
        await session.commit()
        return True
    paths = list(
        await session.scalars(
            select(DocumentVersion.storage_path).where(DocumentVersion.document_id == document.id)
        )
    )
    await session.execute(delete(Document).where(Document.id == document.id))
    await session.commit()
    for path in paths:
        storage.delete(path)
    return False


# Dipakai pembentukan role untuk menyimpan hasil tanya jawab sebagai dokumen (kontrak 16.1)
add_file_version = _add_version
enqueue_version = _enqueue
