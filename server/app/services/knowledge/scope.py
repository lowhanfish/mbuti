"""Siapa boleh membaca dokumen apa."""

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import ColumnElement

from app.models import Agent, Document


def visible_to(
    knowledge_scope: ColumnElement, agent_id: ColumnElement, unit_id: ColumnElement
) -> ColumnElement[bool]:
    """
    Syarat dokumen yang boleh dibaca sebuah role. Dokumen organisasi selalu terbaca;
    selain itu menurut lingkup pengetahuan role. Argumennya kolom `agents` (untuk hitungan
    per baris) atau `literal(...)` (untuk satu role).
    """
    colleague = aliased(Agent)
    from_colleague = exists(
        select(colleague.id).where(
            colleague.id == Document.agent_id,
            colleague.unit_id == unit_id,
            colleague.deleted_at.is_(None),
        )
    ).correlate_except(colleague)
    return or_(
        Document.scope == "organization",
        knowledge_scope == "organization",
        Document.agent_id == agent_id,
        and_(knowledge_scope == "unit", or_(Document.unit_id == unit_id, from_colleague)),
    )
