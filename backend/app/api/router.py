from fastapi import APIRouter

from app.api.routes import (
    accounts,
    admin,
    checkins,
    donors,
    drives,
    health,
    hospitals,
    intake,
    logistics,
    notifications,
    public,
    requests,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(public.router)
api_router.include_router(accounts.router)
api_router.include_router(admin.router)
api_router.include_router(hospitals.router)
api_router.include_router(donors.router)
api_router.include_router(drives.router)
api_router.include_router(checkins.router)
api_router.include_router(intake.router)
api_router.include_router(requests.router)
api_router.include_router(logistics.router)
api_router.include_router(notifications.router)
