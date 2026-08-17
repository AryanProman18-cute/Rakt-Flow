from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from geoalchemy2 import Geography, Geometry
from sqlalchemy import cast, func, null, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.models.entities import BloodRequest, DonationRecord, Drive, HospitalProfile, RequestStatus

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/config")
async def public_config(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    return {
        "initiative_name": "RaktFlow",
        "contact_email": settings.contact_email,
        "contact_phone": settings.contact_phone,
        "country": "India",
        "clinical_notice": "Online registration and screening never replace qualified on-site clearance.",
    }


@router.get("/requests")
async def verified_public_requests(
    session: Annotated[AsyncSession, Depends(get_session)],
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float = Query(default=100, ge=1, le=500),
) -> list[dict]:
    now = datetime.now(UTC)
    request_geometry = cast(BloodRequest.location, Geometry("POINT", srid=4326))
    distance = None
    statement = (
        select(
            BloodRequest,
            HospitalProfile.facility_name,
            HospitalProfile.city,
            HospitalProfile.state,
            func.ST_Y(request_geometry).label("latitude"),
            func.ST_X(request_geometry).label("longitude"),
        )
        .join(HospitalProfile, HospitalProfile.user_id == BloodRequest.hospital_user_id)
        .where(
            HospitalProfile.status == "VERIFIED",
            BloodRequest.status == RequestStatus.VERIFIED,
            BloodRequest.expires_at > now,
        )
    )
    if latitude is not None and longitude is not None:
        nearby_point = cast(
            func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326),
            Geography("POINT", srid=4326),
        )
        distance = func.ST_Distance(BloodRequest.location, nearby_point) / 1000.0
        statement = statement.add_columns(distance.label("distance_km")).where(
            BloodRequest.location.is_not(None),
            func.ST_DWithin(BloodRequest.location, nearby_point, radius_km * 1000),
        ).order_by(distance, BloodRequest.created_at.desc())
    else:
        statement = statement.add_columns(null().label("distance_km")).order_by(
            BloodRequest.created_at.desc()
        )
    rows = (await session.execute(statement.limit(100))).all()
    return [
        {
            "id": str(request.id), "facility_name": facility, "city": city, "state": state,
            "blood_type": request.blood_type, "phenotype_code": request.phenotype_code,
            "component_type": request.component_type, "units_needed": request.units_needed,
            "urgency": request.urgency.value, "expires_at": request.expires_at,
            "latitude": request_latitude, "longitude": request_longitude,
            "distance_km": round(float(distance_km), 1) if distance_km is not None else None,
            "verified": True,
        }
        for request, facility, city, state, request_latitude, request_longitude, distance_km in rows
    ]


@router.get("/centres")
async def verified_public_centres(
    session: Annotated[AsyncSession, Depends(get_session)],
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float = Query(default=100, ge=1, le=500),
) -> list[dict]:
    geometry = cast(HospitalProfile.location, Geometry("POINT", srid=4326))
    statement = select(
        HospitalProfile,
        func.ST_Y(geometry).label("latitude"),
        func.ST_X(geometry).label("longitude"),
    ).where(HospitalProfile.status == "VERIFIED", HospitalProfile.location.is_not(None))
    if latitude is not None and longitude is not None:
        nearby_point = cast(
            func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326),
            Geography("POINT", srid=4326),
        )
        distance = func.ST_Distance(HospitalProfile.location, nearby_point) / 1000.0
        statement = statement.add_columns(distance.label("distance_km")).where(
            func.ST_DWithin(HospitalProfile.location, nearby_point, radius_km * 1000)
        ).order_by(distance, HospitalProfile.facility_name)
    else:
        statement = statement.add_columns(null().label("distance_km")).order_by(
            HospitalProfile.facility_name
        )
    rows = (await session.execute(statement.limit(500))).all()
    return [
        {
            "id": str(profile.id), "name": profile.facility_name, "address": profile.address,
            "city": profile.city, "state": profile.state, "latitude": profile_latitude,
            "longitude": profile_longitude,
            "distance_km": round(float(distance_km), 1) if distance_km is not None else None,
            "verified": True,
        }
        for profile, profile_latitude, profile_longitude, distance_km in rows
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
