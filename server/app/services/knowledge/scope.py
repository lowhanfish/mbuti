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
    by_scope = or_(
        Document.scope == "organization",
        knowledge_scope == "organization",
        Document.agent_id == agent_id,
        and_(knowledge_scope == "unit", or_(Document.unit_id == unit_id, from_colleague)),
    )
    # Uraian jabatan dan hasil tanya jawab hanya dibaca role pemiliknya (kontrak 16.4)
    own_formation = or_(
        Document.category.not_in(("formation", "qa")), Document.agent_id == agent_id
    )
    return and_(by_scope, own_formation)
