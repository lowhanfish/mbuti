from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base
from app.models.base import created_at, created_by, updated_at, uuid_pk

TASK_STATUSES = (
    "queued",
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "cancelled",
    "stopped_budget",
)
# Tugas yang masih bisa berjalan atau menunggu keputusan
OPEN_STATUSES = ("queued", "running", "waiting_approval")


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (CheckConstraint(f"status IN {TASK_STATUSES}", name="status"),)

    id = uuid_pk()
    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String(150), nullable=False)
    brief = Column(String(4000), nullable=False, default="")
    inputs = Column(JSONB, nullable=False, default=dict)
    entry_agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    status = Column(String(20), nullable=False, default="queued")
    priority = Column(String(10), nullable=False, default="normal")
    due_at = Column(DateTime(timezone=True), nullable=True)
    budget_limit = Column(Integer, nullable=False)
    # role = ikut pengaturan role; off = tanpa internet untuk tugas ini (E1d)
    web_search = Column(String(4), nullable=False, default="role", server_default="role")
    # role = ikut mode role; selain itu mengganti mode semua role di tugas ini (E3c)
    compose_mode = Column(String(8), nullable=False, default="role", server_default="role")
    # Alur aplikasi yang dijalankan sesudah pekerjaan selesai (E4c): {flow_id, name, values}.
    # Tanpa kunci asing: alur yang dihapus harus membuat tugasnya gagal, bukan diam-diam dilewati
    flow = Column(JSONB(none_as_null=True), nullable=True)
    # None (belum), prepare, running, done
    flow_stage = Column(String(8), nullable=True)
    cost_used = Column(Integer, nullable=False, default=0)
    # Jumlah putaran revisi per relasi Periksa
    review_rounds = Column(JSONB, nullable=False, default=dict)
    # Relasi yang menunggu dijalankan worker setelah keputusan manusia
    pending_routes = Column(JSONB, nullable=False, default=list)
    created_by_member_id = Column(
        UUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    created_at = created_at()
    updated_at = updated_at()
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_by = created_by()


Index("ix_tasks_organization_updated", Task.organization_id, Task.updated_at)
Index("ix_tasks_status", Task.status)
