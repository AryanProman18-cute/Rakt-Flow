from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2 import Geography, Geometry
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from sqlalchemy import cast, func, null, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import (
    BloodComponent,
    BloodRequest,
    Campaign,
    CheckIn,
    DonationRecord,
    DonorProfile,
    Drive,
    DriveBloodQuota,
    DriveProposal,
    DriveRegistration,
    RequestStatus,
    Screening,
    User,
)
from app.schemas.accounts import DriveCreate, DriveStatusUpdate
from app.schemas.integrated import DriveQuotaUpdate, DriveRegistrationCreate
from app.schemas.operations import DriveProposalCreate, DriveUpdate, ProposalDecision
from app.services.audit import append_audit_event

router = APIRouter(prefix="/drives", tags=["drives"])


def view(drive: Drive) -> dict:
    return {
        "id": str(drive.id),
        "name": drive.name,
        "venue_name": drive.venue_name,
        "address": drive.address,
        "starts_at": drive.starts_at,
        "ends_at": drive.ends_at,
        "target_units": drive.target_units,
        "status": drive.status,
    }


@router.get("/public")
async def public_drives(
    session: Annotated[AsyncSession, Depends(get_session)],
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float = Query(default=100, ge=1, le=500),
) -> list[dict]:
    geometry = cast(Drive.location, Geometry("POINT", srid=4326))
    statement = select(
        Drive,
        func.ST_Y(geometry).label("latitude"),
        func.ST_X(geometry).label("longitude"),
    ).where(
        Drive.status.in_(["APPROVED", "ACTIVE"]),
        Drive.ends_at > datetime.now(UTC),
    )
    if latitude is not None and longitude is not None:
        nearby_point = cast(
            func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326),
            Geography("POINT", srid=4326),
        )
        distance = func.ST_Distance(Drive.location, nearby_point) / 1000.0
        statement = statement.add_columns(distance.label("distance_km")).where(
            Drive.location.is_not(None),
            func.ST_DWithin(Drive.location, nearby_point, radius_km * 1000),
        ).order_by(distance, Drive.starts_at)
    else:
        statement = statement.add_columns(null().label("distance_km")).order_by(Drive.starts_at)
    rows = (await session.execute(statement.limit(100))).all()
    result = []
    for drive, drive_latitude, drive_longitude, distance_km in rows:
        item = view(drive)
        item.update({
            "latitude": drive_latitude,
            "longitude": drive_longitude,
            "distance_km": round(float(distance_km), 1) if distance_km is not None else None,
        })
        result.append(item)
    return result


@router.get("/mine")
async def my_drives(
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    statement = select(Drive).order_by(Drive.starts_at.desc()).limit(100)
    if "ROLE_SUPER_ADMIN" not in actor.roles:
        statement = statement.where(Drive.organizer_user_id == user.id)
    drives = list((await session.scalars(statement)).all())
    return [view(drive) for drive in drives]


async def _owned_drive(session: AsyncSession, actor: Actor, user: User, drive_id: UUID) -> Drive:
    drive = await session.get(Drive, drive_id)
    if drive is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drive not found")
    if drive.organizer_user_id != user.id and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the drive owner or Super Admin may view this data")
    return drive


def quota_view(quota: DriveBloodQuota) -> dict:
    return {
        "id": str(quota.id), "drive_id": str(quota.drive_id), "blood_type": quota.blood_type,
        "max_registrations": quota.max_registrations,
        "source_request_id": str(quota.source_request_id) if quota.source_request_id else None,
        "rationale": quota.rationale, "active": quota.active,
    }


@router.get("/{drive_id}/quotas")
async def drive_quotas(
    drive_id: UUID,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    await _owned_drive(session, actor, user, drive_id)
    rows = (await session.scalars(
        select(DriveBloodQuota).where(DriveBloodQuota.drive_id == drive_id)
        .order_by(DriveBloodQuota.blood_type)
    )).all()
    return [quota_view(row) for row in rows]


@router.put("/{drive_id}/quotas")
async def update_drive_quotas(
    drive_id: UUID,
    payload: DriveQuotaUpdate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    drive = await _owned_drive(session, actor, user, drive_id)
    if drive.status in {"COMPLETED", "CANCELLED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Closed drives cannot change booking quotas")
    rows = list((await session.scalars(
        select(DriveBloodQuota).where(DriveBloodQuota.drive_id == drive.id).with_for_update()
    )).all())
    by_type = {row.blood_type: row for row in rows}
    submitted = set()
    for item in payload.quotas:
        blood_type = item.blood_type.upper()
        submitted.add(blood_type)
        row = by_type.get(blood_type)
        if row is None:
            row = DriveBloodQuota(drive_id=drive.id, blood_type=blood_type, max_registrations=item.max_registrations)
            session.add(row)
            rows.append(row)
        if item.source_request_id:
            source_request = await session.get(BloodRequest, item.source_request_id)
            if (
                source_request is None or source_request.status != RequestStatus.VERIFIED
                or source_request.expires_at <= datetime.now(UTC)
            ):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Quota links require an active verified facility need")
            if source_request.blood_type != blood_type:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Quota blood group must match the linked verified need")
        row.max_registrations = item.max_registrations
        row.source_request_id = item.source_request_id
        row.rationale = item.rationale.strip() or None
        row.active = item.active
    for row in rows:
        if row.blood_type not in submitted:
            row.active = False
    await append_audit_event(
        session, actor_uid=actor.uid, action="DRIVE_BLOOD_QUOTAS_UPDATED",
        resource_type="drive", resource_id=drive.id,
        metadata={"blood_types": sorted(submitted)},
    )
    await session.commit()
    return [quota_view(row) for row in sorted(rows, key=lambda value: value.blood_type)]


@router.get("/{drive_id}/quota-recommendations")
async def quota_recommendations(
    drive_id: UUID,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    drive = await _owned_drive(session, actor, user, drive_id)
    groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "BOMBAY"]
    results = []
    for blood_type in groups:
        need = int(await session.scalar(
            select(func.coalesce(func.sum(BloodRequest.units_needed), 0)).where(
                BloodRequest.status == RequestStatus.VERIFIED,
                BloodRequest.expires_at > datetime.now(UTC),
                BloodRequest.blood_type == blood_type,
            )
        ) or 0)
        available = int(await session.scalar(
            select(func.count()).select_from(BloodComponent).where(
                BloodComponent.blood_type == blood_type,
                BloodComponent.status == "AVAILABLE",
                BloodComponent.expires_at > datetime.now(UTC),
            )
        ) or 0)
        baseline = max(1, round(drive.target_units / 8))
        suggested = max(0, min(drive.target_units, need - max(available, 0))) if need else baseline
        results.append({
            "blood_type": blood_type, "verified_need_units": need,
            "available_inventory_units": max(available, 0),
            "suggested_max_registrations": suggested,
            "advisory_only": True,
        })
    return results


@router.get("/registrations/mine")
async def my_drive_registrations(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    if donor is None:
        return []
    rows = (
        await session.execute(
            select(DriveRegistration, Drive, Campaign.slug)
            .join(Drive, Drive.id == DriveRegistration.drive_id)
            .outerjoin(Campaign, Campaign.id == DriveRegistration.source_campaign_id)
            .where(DriveRegistration.donor_id == donor.id)
            .order_by(DriveRegistration.registered_at.desc())
            .limit(100)
        )
    ).all()
    return [
        {
            "registration_id": str(registration.id),
            "status": registration.status,
            "registered_at": registration.registered_at,
            "checked_in_at": registration.checked_in_at,
            "campaign_slug": campaign_slug,
            "drive": view(drive),
        }
        for registration, drive, campaign_slug in rows
    ]


@router.post("/{drive_id}/registrations", status_code=status.HTTP_201_CREATED)
async def register_for_drive(
    drive_id: UUID,
    payload: DriveRegistrationCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    drive = await session.get(Drive, drive_id)
    if drive is None or drive.status not in {"APPROVED", "ACTIVE"} or drive.ends_at <= datetime.now(UTC):
        raise HTTPException(status.HTTP_409_CONFLICT, "This drive is not open for registration")
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    if donor is None or donor.profile_status != "COMPLETE":
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete your donor profile before registering")
    if donor.blood_type == "UNKNOWN":
        raise HTTPException(status.HTTP_409_CONFLICT, "Select your self-reported blood group before registering")
    screening = await session.scalar(
        select(Screening).where(Screening.donor_id == donor.id)
        .order_by(Screening.created_at.desc()).limit(1)
    )
    if screening is None or screening.valid_until <= datetime.now(UTC):
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete a current donor pre-check before booking a drive")
    if screening.eligible_on and screening.eligible_on > datetime.now(UTC).date():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"The pre-check countdown allows a new booking from {screening.eligible_on.isoformat()}",
        )
    if screening.outcome == "TEMPORARY_DEFERRAL_SUGGESTED" and screening.review_status != "APPROVED":
        raise HTTPException(status.HTTP_409_CONFLICT, "A temporary-deferral pre-check must be reviewed before booking")
    quota = await session.scalar(
        select(DriveBloodQuota).where(
            DriveBloodQuota.drive_id == drive.id,
            DriveBloodQuota.blood_type == donor.blood_type,
            DriveBloodQuota.active.is_(True),
        )
    )
    if quota:
        registered = int(await session.scalar(
            select(func.count()).select_from(DriveRegistration).join(
                DonorProfile, DonorProfile.id == DriveRegistration.donor_id
            ).where(
                DriveRegistration.drive_id == drive.id,
                DriveRegistration.status != "CANCELLED",
                DonorProfile.blood_type == donor.blood_type,
            )
        ) or 0)
        if registered >= quota.max_registrations:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"The current {donor.blood_type} booking quota is full; choose another approved drive",
            )
    campaign = None
    if payload.campaign_id:
        campaign = await session.scalar(
            select(Campaign).where(
                Campaign.id == payload.campaign_id,
                Campaign.drive_id == drive.id,
                Campaign.status == "PUBLISHED",
            )
        )
        if campaign is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Campaign does not match this drive")
    registration = await session.scalar(
        select(DriveRegistration).where(
            DriveRegistration.drive_id == drive.id,
            DriveRegistration.donor_id == donor.id,
        ).with_for_update()
    )
    now = datetime.now(UTC)
    created = registration is None
    if registration is None:
        registration = DriveRegistration(
            drive_id=drive.id,
            donor_id=donor.id,
            source_campaign_id=campaign.id if campaign else None,
            status="REGISTERED",
            registered_at=now,
        )
        session.add(registration)
        await session.flush()
    elif registration.status == "CANCELLED":
        registration.status = "REGISTERED"
        registration.registered_at = now
        registration.source_campaign_id = campaign.id if campaign else registration.source_campaign_id
    await append_audit_event(
        session,
        actor_uid=actor.uid,
        action="DRIVE_REGISTRATION_CREATED" if created else "DRIVE_REGISTRATION_CONFIRMED",
        resource_type="drive_registration",
        resource_id=registration.id,
        metadata={"drive_id": str(drive.id), "campaign_id": str(campaign.id) if campaign else None},
    )
    await session.commit()
    return {
        "registration_id": str(registration.id),
        "drive_id": str(drive.id),
        "status": registration.status,
        "registered_at": registration.registered_at,
        "created": created,
    }


@router.delete("/{drive_id}/registrations/me")
async def cancel_drive_registration(
    drive_id: UUID,
    actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    registration = await session.scalar(
        select(DriveRegistration).where(
            DriveRegistration.drive_id == drive_id,
            DriveRegistration.donor_id == (donor.id if donor else None),
        ).with_for_update()
    )
    if registration is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registration not found")
    if registration.status == "CHECKED_IN":
        raise HTTPException(status.HTTP_409_CONFLICT, "A checked-in registration cannot be cancelled")
    registration.status = "CANCELLED"
    await append_audit_event(
        session, actor_uid=actor.uid, action="DRIVE_REGISTRATION_CANCELLED",
        resource_type="drive_registration", resource_id=registration.id,
    )
    await session.commit()
    return {"registration_id": str(registration.id), "status": registration.status}


@router.get("/{drive_id}/roster")
async def drive_roster(
    drive_id: UUID,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    await _owned_drive(session, actor, user, drive_id)
    registrations = (
        await session.execute(
            select(DriveRegistration, DonorProfile)
            .join(DonorProfile, DonorProfile.id == DriveRegistration.donor_id)
            .where(DriveRegistration.drive_id == drive_id)
            .order_by(DriveRegistration.registered_at.desc())
            .limit(500)
        )
    ).all()
    result: list[dict] = []
    seen: set[UUID] = set()
    for registration, donor in registrations:
        seen.add(donor.id)
        checkin = await session.scalar(
            select(CheckIn).where(CheckIn.drive_id == drive_id, CheckIn.donor_id == donor.id)
            .order_by(CheckIn.scanned_at.desc()).limit(1)
        )
        donation = await session.scalar(
            select(DonationRecord).where(
                DonationRecord.drive_id == drive_id,
                DonationRecord.donor_id == donor.id,
            ).order_by(DonationRecord.collected_at.desc()).limit(1)
        )
        result.append({
            "registration_id": str(registration.id),
            "donor_reference": donor.reference_code,
            "display_name": donor.display_name,
            "blood_type": donor.blood_type,
            "registration_status": registration.status,
            "registered_at": registration.registered_at,
            "checkin_id": str(checkin.id) if checkin else None,
            "checked_in_at": checkin.scanned_at if checkin else None,
            "clearance_status": checkin.clearance_status if checkin else "NOT_CHECKED_IN",
            "donation_recorded": donation is not None,
            "unit_reference": donation.unit_reference if donation else None,
        })
    unregistered = (
        await session.execute(
            select(CheckIn, DonorProfile)
            .join(DonorProfile, DonorProfile.id == CheckIn.donor_id)
            .where(CheckIn.drive_id == drive_id, CheckIn.donor_id.not_in(seen) if seen else True)
            .order_by(CheckIn.scanned_at.desc())
            .limit(500)
        )
    ).all()
    for checkin, donor in unregistered:
        donation = await session.scalar(
            select(DonationRecord).where(DonationRecord.checkin_id == checkin.id)
        )
        result.append({
            "registration_id": None,
            "donor_reference": donor.reference_code,
            "display_name": donor.display_name,
            "blood_type": donor.blood_type,
            "registration_status": "WALK_IN",
            "registered_at": None,
            "checkin_id": str(checkin.id),
            "checked_in_at": checkin.scanned_at,
            "clearance_status": checkin.clearance_status,
            "donation_recorded": donation is not None,
            "unit_reference": donation.unit_reference if donation else None,
        })
    return result


@router.get("/{drive_id}/reconciliation")
async def drive_reconciliation(
    drive_id: UUID,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    drive = await _owned_drive(session, actor, user, drive_id)
    records = (
        await session.execute(
            select(DonationRecord, DonorProfile)
            .join(DonorProfile, DonorProfile.id == DonationRecord.donor_id)
            .where(DonationRecord.drive_id == drive.id)
            .order_by(DonationRecord.collected_at.desc())
        )
    ).all()
    checkins = int(await session.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.drive_id == drive.id)) or 0)
    cleared = int(await session.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.drive_id == drive.id, CheckIn.clearance_status == "CLEARED")) or 0)
    deferred = int(await session.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.drive_id == drive.id, CheckIn.clearance_status == "DEFERRED")) or 0)
    registrations = int(await session.scalar(select(func.count()).select_from(DriveRegistration).where(DriveRegistration.drive_id == drive.id, DriveRegistration.status != "CANCELLED")) or 0)
    total_volume = sum(record.volume_ml or 0 for record, _donor in records)
    return {
        "drive": view(drive),
        "registrations": registrations,
        "checkins": checkins,
        "cleared": cleared,
        "deferred": deferred,
        "units_logged": len(records),
        "total_volume_ml": total_volume,
        "target_completion_percent": round((len(records) / drive.target_units) * 100, 1) if drive.target_units else 0,
        "records": [
            {
                "donor_reference": donor.reference_code,
                "display_name": donor.display_name,
                "unit_reference": record.unit_reference,
                "component_type": record.component_type,
                "blood_type": record.blood_type_at_collection,
                "volume_ml": record.volume_ml,
                "collected_at": record.collected_at,
            }
            for record, donor in records
        ],
    }


@router.patch("/{drive_id}/status")
async def update_drive_status(
    drive_id: UUID,
    payload: DriveStatusUpdate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    drive = await session.scalar(select(Drive).where(Drive.id == drive_id).with_for_update())
    if drive is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drive not found")
    if drive.organizer_user_id != user.id and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the drive owner may operate this drive")
    organizer_transitions = {
        "PLANNED": {"CANCELLED"}, "APPROVED": {"ACTIVE", "CANCELLED"},
        "ACTIVE": {"COMPLETED", "CANCELLED"}, "COMPLETED": set(), "CANCELLED": set(),
    }
    if "ROLE_SUPER_ADMIN" not in actor.roles and payload.status not in organizer_transitions.get(drive.status, set()):
        raise HTTPException(status.HTTP_409_CONFLICT, "This status transition requires Super Admin approval")
    drive.status = payload.status
    await append_audit_event(session, actor_uid=actor.uid, action="DRIVE_STATUS_CHANGED", resource_type="drive", resource_id=drive.id, metadata={"status": payload.status})
    await session.commit()
    return view(drive)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_drive(
    payload: DriveCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Drive end time must be after start time")
    location = None
    if payload.latitude is not None and payload.longitude is not None:
        location = ST_SetSRID(ST_MakePoint(payload.longitude, payload.latitude), 4326)
    drive = Drive(
        organizer_user_id=user.id,
        venue_id=None,
        venue_name=payload.venue_name,
        address=payload.address,
        location=location,
        name=payload.name,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        target_units=payload.target_units,
        status="PLANNED",
    )
    session.add(drive)
    await session.flush()
    await append_audit_event(session, actor_uid=actor.uid, action="DRIVE_CREATED", resource_type="drive", resource_id=drive.id)
    await session.commit()
    return view(drive)


@router.patch("/{drive_id}")
async def edit_drive(
    drive_id: UUID,
    payload: DriveUpdate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    drive = await session.scalar(select(Drive).where(Drive.id == drive_id).with_for_update())
    if drive is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drive not found")
    if drive.organizer_user_id != user.id and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the drive owner may edit this drive")
    if drive.status in {"COMPLETED", "CANCELLED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Completed or cancelled drives are immutable")
    changes = payload.model_dump(exclude_unset=True)
    starts_at = changes.get("starts_at", drive.starts_at)
    ends_at = changes.get("ends_at", drive.ends_at)
    if ends_at <= starts_at:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Drive end time must be after start time")
    for field, value in changes.items():
        setattr(drive, field, value)
    await append_audit_event(
        session, actor_uid=actor.uid, action="DRIVE_EDITED", resource_type="drive",
        resource_id=drive.id, metadata={"fields": sorted(changes)},
    )
    await session.commit()
    return view(drive)


@router.get("/{drive_id}/analytics")
async def drive_analytics(
    drive_id: UUID,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER", "ROLE_HOST_VENUE"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    drive = await session.get(Drive, drive_id)
    if drive is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drive not found")
    allowed = drive.organizer_user_id == user.id or "ROLE_SUPER_ADMIN" in actor.roles
    if not allowed and "ROLE_HOST_VENUE" in actor.roles:
        host_link = await session.scalar(
            select(DriveProposal.id).where(
                DriveProposal.resulting_drive_id == drive.id,
                func.lower(DriveProposal.host_email) == actor.email.lower(),
            )
        )
        allowed = host_link is not None
    if not allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Drive analytics are not available to this account")
    checkins = int(await session.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.drive_id == drive.id)) or 0)
    cleared = int(await session.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.drive_id == drive.id, CheckIn.clearance_status == "CLEARED")) or 0)
    deferred = int(await session.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.drive_id == drive.id, CheckIn.clearance_status == "DEFERRED")) or 0)
    donation_result = (
        await session.execute(
            select(func.count(DonationRecord.id), func.coalesce(func.sum(DonationRecord.volume_ml), 0))
            .where(DonationRecord.drive_id == drive.id)
        )
    ).one()
    collections = int(donation_result[0] or 0)
    return {
        "drive": view(drive), "checkins": checkins, "cleared": cleared, "deferred": deferred,
        "collections": collections, "volume_ml": int(donation_result[1] or 0),
        "target_units": drive.target_units,
        "target_completion_percent": round((collections / drive.target_units) * 100, 1) if drive.target_units else 0,
        "collection_conversion_percent": round((collections / checkins) * 100, 1) if checkins else 0,
    }


def proposal_view(proposal: DriveProposal) -> dict:
    return {
        "id": str(proposal.id), "host_email": proposal.host_email,
        "proposed_name": proposal.proposed_name, "venue_name": proposal.venue_name,
        "address": proposal.address, "starts_at": proposal.starts_at, "ends_at": proposal.ends_at,
        "target_units": proposal.target_units, "requirements": proposal.requirements_json,
        "status": proposal.status, "response_note": proposal.response_note,
        "resulting_drive_id": str(proposal.resulting_drive_id) if proposal.resulting_drive_id else None,
    }


@router.post("/proposals", status_code=status.HTTP_201_CREATED)
async def create_proposal(
    payload: DriveProposalCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    organizer: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    proposal = DriveProposal(
        organizer_user_id=organizer.id, host_email=str(payload.host_email).lower(),
        proposed_name=payload.proposed_name, venue_name=payload.venue_name, address=payload.address,
        starts_at=payload.starts_at, ends_at=payload.ends_at, target_units=payload.target_units,
        requirements_json={
            "power_available": payload.power_available, "wifi_available": payload.wifi_available,
            "recovery_seats": payload.recovery_seats, "parking_available": payload.parking_available,
            "privacy_partitions": payload.privacy_partitions,
            "latitude": payload.latitude, "longitude": payload.longitude,
        },
        status="PENDING",
    )
    session.add(proposal)
    await session.flush()
    await append_audit_event(
        session, actor_uid=actor.uid, action="DRIVE_PROPOSAL_CREATED",
        resource_type="drive_proposal", resource_id=proposal.id,
    )
    await session.commit()
    return proposal_view(proposal)


@router.get("/proposals/mine")
async def my_proposals(
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER", "ROLE_HOST_VENUE"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    statement = select(DriveProposal).order_by(DriveProposal.created_at.desc()).limit(250)
    if "ROLE_SUPER_ADMIN" not in actor.roles:
        filters = []
        if "ROLE_ORGANIZER" in actor.roles:
            filters.append(DriveProposal.organizer_user_id == user.id)
        if "ROLE_HOST_VENUE" in actor.roles:
            filters.append(func.lower(DriveProposal.host_email) == actor.email.lower())
        statement = statement.where(*([filters[0] | filters[1]] if len(filters) == 2 else filters))
    proposals = (await session.scalars(statement)).all()
    return [proposal_view(proposal) for proposal in proposals]


@router.get("/proposals/host-impact")
async def host_proposal_impact(
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOST_VENUE"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    proposals = (await session.scalars(
        select(DriveProposal).where(
            func.lower(DriveProposal.host_email) == actor.email.lower(),
            DriveProposal.resulting_drive_id.is_not(None),
        ).order_by(DriveProposal.starts_at.desc()).limit(250)
    )).all()
    results = []
    for proposal in proposals:
        drive_id = proposal.resulting_drive_id
        registrations = int(await session.scalar(
            select(func.count()).select_from(DriveRegistration).where(
                DriveRegistration.drive_id == drive_id,
                DriveRegistration.status != "CANCELLED",
            )
        ) or 0)
        checkins = int(await session.scalar(
            select(func.count()).select_from(CheckIn).where(CheckIn.drive_id == drive_id)
        ) or 0)
        units = int(await session.scalar(
            select(func.count()).select_from(DonationRecord).where(
                DonationRecord.drive_id == drive_id
            )
        ) or 0)
        results.append({
            "proposal_id": str(proposal.id), "drive_id": str(drive_id),
            "drive_name": proposal.proposed_name, "venue_name": proposal.venue_name,
            "starts_at": proposal.starts_at, "registrations": registrations,
            "checkins": checkins, "units_logged": units,
            "privacy_notice": "Aggregate host impact only; no donor identity or health data is included.",
        })
    return results


@router.post("/proposals/{proposal_id}/decision")
async def decide_proposal(
    proposal_id: UUID,
    payload: ProposalDecision,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOST_VENUE"))],
    responder: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    proposal = await session.scalar(
        select(DriveProposal).where(DriveProposal.id == proposal_id).with_for_update()
    )
    if proposal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    if proposal.status not in {"PENDING", "CHANGES_REQUESTED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal is no longer actionable")
    if actor.email.lower() != proposal.host_email.lower() and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This proposal belongs to another host")
    proposal.status = payload.decision
    proposal.response_note = payload.note or None
    proposal.responded_by_user_id = responder.id
    proposal.responded_at = datetime.now(UTC)
    if payload.decision == "APPROVED":
        latitude = proposal.requirements_json.get("latitude")
        longitude = proposal.requirements_json.get("longitude")
        location = (
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
            if latitude is not None and longitude is not None else None
        )
        drive = Drive(
            organizer_user_id=proposal.organizer_user_id, venue_id=None,
            venue_name=proposal.venue_name, address=proposal.address, location=location,
            name=proposal.proposed_name, starts_at=proposal.starts_at, ends_at=proposal.ends_at,
            target_units=proposal.target_units, status="APPROVED",
        )
        session.add(drive)
        await session.flush()
        proposal.resulting_drive_id = drive.id
    await append_audit_event(
        session, actor_uid=actor.uid, action=f"DRIVE_PROPOSAL_{payload.decision}",
        resource_type="drive_proposal", resource_id=proposal.id,
    )
    await session.commit()
    return proposal_view(proposal)
