from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.entities import BloodRequest, DonationRecord, Drive, HospitalProfile, RequestStatus

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/requests")
async def verified_public_requests(session: Annotated[AsyncSession, Depends(get_session)]) -> list[dict]:
    now = datetime.now(UTC)
    rows = (
        await session.execute(
            select(BloodRequest, HospitalProfile.facility_name, HospitalProfile.city, HospitalProfile.state)
            .join(HospitalProfile, HospitalProfile.user_id == BloodRequest.hospital_user_id)
            .where(
                HospitalProfile.status == "VERIFIED",
                BloodRequest.status == RequestStatus.VERIFIED,
                BloodRequest.expires_at > now,
            )
            .order_by(BloodRequest.created_at.desc()).limit(100)
        )
    ).all()
    return [
        {
            "id": str(request.id), "facility_name": facility, "city": city, "state": state,
            "blood_type": request.blood_type, "phenotype_code": request.phenotype_code,
            "component_type": request.component_type, "units_needed": request.units_needed,
            "urgency": request.urgency.value, "expires_at": request.expires_at,
            "verified": True,
        }
        for request, facility, city, state in rows
    ]


@router.get("/centres")
async def verified_public_centres(session: Annotated[AsyncSession, Depends(get_session)]) -> list[dict]:
    geometry = cast(HospitalProfile.location, Geometry("POINT", srid=4326))
    rows = (
        await session.execute(
            select(
                HospitalProfile,
                func.ST_Y(geometry).label("latitude"),
                func.ST_X(geometry).label("longitude"),
            )
            .where(HospitalProfile.status == "VERIFIED", HospitalProfile.location.is_not(None))
            .order_by(HospitalProfile.facility_name).limit(500)
        )
    ).all()
    return [
        {
            "id": str(profile.id), "name": profile.facility_name, "address": profile.address,
            "city": profile.city, "state": profile.state, "latitude": latitude,
            "longitude": longitude, "verified": True,
        }
        for profile, latitude, longitude in rows
    ]


@router.get("/stats")
async def public_stats(session: Annotated[AsyncSession, Depends(get_session)]) -> dict[str, int | str]:
    now = datetime.now(UTC)
    active_requests = await session.scalar(
        select(func.count()).select_from(BloodRequest).where(
            BloodRequest.status == RequestStatus.VERIFIED,
            BloodRequest.expires_at > now,
        )
    )
    active_drives = await session.scalar(
        select(func.count()).select_from(Drive).where(
            Drive.status.in_(["APPROVED", "ACTIVE"]),
            Drive.ends_at > now,
        )
    )
    donations = await session.scalar(select(func.count()).select_from(DonationRecord))
    return {
        "verified_active_requests": int(active_requests or 0),
        "upcoming_drives": int(active_drives or 0),
        "recorded_donations": int(donations or 0),
        "as_of": now.isoformat(),
    }
