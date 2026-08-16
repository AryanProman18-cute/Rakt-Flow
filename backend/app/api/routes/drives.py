from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import CheckIn, DonationRecord, Drive, DriveProposal, User
from app.schemas.accounts import DriveCreate, DriveStatusUpdate
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
async def public_drives(session: Annotated[AsyncSession, Depends(get_session)]) -> list[dict]:
    drives = list(
        (
            await session.scalars(
                select(Drive)
                .where(Drive.status.in_(["APPROVED", "ACTIVE"]))
                .order_by(Drive.starts_at)
                .limit(100)
            )
        ).all()
    )
    return [view(drive) for drive in drives]


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
        drive = Drive(
            organizer_user_id=proposal.organizer_user_id, venue_id=None,
            venue_name=proposal.venue_name, address=proposal.address,
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
