"""Router utama /api/v1."""

from fastapi import APIRouter

from app.api.v1.endpoints.admin.organisasi.route import router as organisasi_router
from app.api.v1.endpoints.admin.pengguna.route import router as pengguna_router
from app.api.v1.endpoints.admin.relasi.route import router as relasi_router
from app.api.v1.endpoints.admin.role.route import router as role_router
from app.api.v1.endpoints.admin.unit.route import router as unit_router
from app.api.v1.endpoints.auth.route import router as auth_router
from app.api.v1.endpoints.health.route import router as health_router

admin_router = APIRouter(prefix="/admin")
admin_router.include_router(organisasi_router)
admin_router.include_router(unit_router)
admin_router.include_router(pengguna_router)
admin_router.include_router(role_router)
admin_router.include_router(relasi_router)

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(admin_router)
