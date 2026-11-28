"""Router utama /api/v1."""

from fastapi import APIRouter, Depends

from app.api.v1.endpoints.admin.audit.route import router as audit_router
from app.api.v1.endpoints.admin.cuti.route import router as cuti_router
from app.api.v1.endpoints.admin.dashboard.route import router as dashboard_router
from app.api.v1.endpoints.admin.kalender.route import router as kalender_router
from app.api.v1.endpoints.admin.kantor.route import router as kantor_router
from app.api.v1.endpoints.admin.organisasi.route import router as organisasi_router
from app.api.v1.endpoints.admin.pembentukan.route import router as pembentukan_router
from app.api.v1.endpoints.admin.pembentukan.route import tools_router
from app.api.v1.endpoints.admin.pengaturan.route import router as pengaturan_router
from app.api.v1.endpoints.admin.pengetahuan.route import router as pengetahuan_router
from app.api.v1.endpoints.admin.pengguna.route import router as pengguna_router
from app.api.v1.endpoints.admin.persetujuan.route import router as persetujuan_router
from app.api.v1.endpoints.admin.relasi.route import router as relasi_router
from app.api.v1.endpoints.admin.role.route import router as role_router
from app.api.v1.endpoints.admin.tugas.route import router as tugas_router
from app.api.v1.endpoints.admin.tugas_rutin.route import router as rutin_router
from app.api.v1.endpoints.admin.unit.route import router as unit_router
from app.api.v1.endpoints.admin.usulan.route import router as usulan_router
from app.api.v1.endpoints.auth.route import router as auth_router
from app.api.v1.endpoints.health.route import router as health_router
from app.services.audit import audit_trail

# Jejak audit ditulis sebelum jawaban dikirim
admin_router = APIRouter(prefix="/admin", dependencies=[Depends(audit_trail, scope="function")])
admin_router.include_router(organisasi_router)
admin_router.include_router(unit_router)
admin_router.include_router(pengguna_router)
admin_router.include_router(cuti_router)
admin_router.include_router(pembentukan_router)
admin_router.include_router(role_router)
admin_router.include_router(tools_router)
admin_router.include_router(relasi_router)
admin_router.include_router(usulan_router)
admin_router.include_router(pengetahuan_router)
admin_router.include_router(pengaturan_router)
admin_router.include_router(kalender_router)
admin_router.include_router(tugas_router)
admin_router.include_router(rutin_router)
admin_router.include_router(persetujuan_router)
admin_router.include_router(kantor_router)
admin_router.include_router(dashboard_router)
admin_router.include_router(audit_router)

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(admin_router)
