from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import (
    BloodRequest,
    Dispatch,
    DonorAlert,
    DonorProfile,
    HospitalProfile,
    NotificationOutbox,
    PlateletWindow,
    RequestStatus,
    RequestUrgency,
    User,
)
from app.schemas.api import (
    DispatchResult,
    PlateletScheduleRequest,
    PPHDispatchCreate,
    RareDispatchCreate,
)
from app.services.audit import append_audit_event
from app.services.platelets import PlateletCandidate, stagger_three_day_schedule

router = APIRouter(prefix="/logistics", tags=["specialized logistics"])


async def authorize_hospital_request(
    session: AsyncSession, actor: Actor, user: User, request: BloodRequest
) -> None:
    if "ROLE_SUPER_ADMIN" in actor.roles:
        return
    profile = await session.scalar(select(HospitalProfile).where(HospitalProfile.user_id == user.id))
    if profile is None or profile.status != "VERIFIED" or request.hospital_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the requesting verified facility may dispatch this workflow")


async def select_rare_candidates(
    session: AsyncSession, request: BloodRequest, radius_km: int, limit: int
) -> list[UUID]:
    distance = func.ST_Distance(DonorProfile.location, request.location)
    prior_alert = select(DonorAlert.id).where(
        DonorAlert.request_id == request.id, DonorAlert.donor_id == DonorProfile.id
    )
    phenotype_filter = (
        DonorProfile.phenotype_codes.contains([request.phenotype_code])
        if request.phenotype_code else True
    )
    statement = (
        select(DonorProfile.id)
        .where(
            DonorProfile.is_on_call_standby.is_(True),
            DonorProfile.eligibility_until > datetime.now(UTC),
            DonorProfile.blood_type == request.blood_type,
            phenotype_filter,
            DonorProfile.location.is_not(None),
            func.ST_DWithin(DonorProfile.location, request.location, radius_km * 1000),
            ~prior_alert.exists(),
        )
        .order_by(distance.asc(), DonorProfile.last_donation_date.asc().nullsfirst())
        .limit(limit)
    )
    return list((await session.scalars(statement)).all())


async def dispatch_tier(
    session: AsyncSession,
    actor: Actor,
    request: BloodRequest,
    *,
    tier: int,
    radius_km: int,
    cohort_size: int,
) -> DispatchResult:
    donor_ids = await select_rare_candidates(session, request, radius_km, cohort_size)
    deadline = datetime.now(UTC) + timedelta(minutes=10)
    for donor_id in donor_ids:
        session.add(DonorAlert(request_id=request.id, donor_id=donor_id, tier=tier, radius_km=radius_km, response_deadline=deadline))
        session.add(NotificationOutbox(topic=f"donor:{donor_id}", event_type="RARE_STANDBY_PAGER", payload_json={"request_id": str(request.id), "tier": tier, "response_deadline": deadline.isoformat()}, available_at=datetime.now(UTC)))
    await append_audit_event(session, actor_uid=actor.uid, action="RARE_TIER_DISPATCHED", resource_type="blood_request", resource_id=request.id, metadata={"tier": tier, "radius_km": radius_km, "donors_contacted": len(donor_ids)})
    await session.commit()
    return DispatchResult(request_id=request.id, tier=tier, radius_km=radius_km, donors_contacted=len(donor_ids), response_deadline=deadline)


@router.post("/rare/dispatch", response_model=DispatchResult)
async def rare_dispatch(
    payload: RareDispatchCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    hospital_user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DispatchResult:
    request = await session.scalar(select(BloodRequest).where(BloodRequest.id == payload.request_id).with_for_update())
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    await authorize_hospital_request(session, actor, hospital_user, request)
    if request.status is not RequestStatus.VERIFIED or request.urgency is not RequestUrgency.RARE_STANDBY:
        raise HTTPException(status.HTTP_409_CONFLICT, "A verified rare-standby request is required")
    existing = await session.scalar(select(DonorAlert.id).where(DonorAlert.request_id == request.id).limit(1))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Rare standby dispatch already started")
    return await dispatch_tier(session, actor, request, tier=1, radius_km=15, cohort_size=payload.cohort_size)


@router.post("/rare/{request_id}/expand", response_model=DispatchResult)
async def expand_rare_dispatch(
    request_id: UUID,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    hospital_user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DispatchResult:
    request = await session.scalar(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    await authorize_hospital_request(session, actor, hospital_user, request)
    if request.status is not RequestStatus.VERIFIED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Verified active request required")
    accepted = await session.scalar(select(func.count()).select_from(DonorAlert).where(DonorAlert.request_id == request_id, DonorAlert.response == "ACCEPTED"))
    last_deadline = await session.scalar(select(func.max(DonorAlert.response_deadline)).where(DonorAlert.request_id == request_id))
    tier_two = await session.scalar(select(DonorAlert.id).where(DonorAlert.request_id == request_id, DonorAlert.tier == 2).limit(1))
    if tier_two:
        raise HTTPException(status.HTTP_409_CONFLICT, "Tier two has already been dispatched")
    if accepted and accepted >= 2:
        raise HTTPException(status.HTTP_409_CONFLICT, "Request has enough accepted donors")
    if last_deadline is None or last_deadline > datetime.now(UTC):
        raise HTTPException(status.HTTP_409_CONFLICT, "The first 10-minute response window is still active")
    return await dispatch_tier(session, actor, request, tier=2, radius_km=30, cohort_size=5)


@router.post("/pph", status_code=status.HTTP_201_CREATED)
async def activate_pph(
    payload: PPHDispatchCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    clinical_owner: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    if not payload.authorization_confirmed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Clinical authorization confirmation is required")
    request = await session.scalar(select(BloodRequest).where(BloodRequest.id == payload.request_id).with_for_update())
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    await authorize_hospital_request(session, actor, clinical_owner, request)
    if request.status is not RequestStatus.VERIFIED or request.urgency is not RequestUrgency.CRITICAL_PPH:
        raise HTTPException(status.HTTP_409_CONFLICT, "A verified CRITICAL_PPH request is required")
    existing = await session.scalar(select(Dispatch).where(Dispatch.request_id == request.id, Dispatch.kind == "PPH").limit(1))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "PPH bridge is already active")
    dispatch = Dispatch(request_id=request.id, kind="PPH", clinical_owner_user_id=clinical_owner.id, status="ACTIVATED", target_arrival_at=datetime.now(UTC) + timedelta(hours=2))
    session.add(dispatch)
    await session.flush()
    session.add(NotificationOutbox(topic=f"hospital:{request.hospital_user_id}:pph", event_type="PPH_BRIDGE_ACTIVATED", payload_json={"dispatch_id": str(dispatch.id), "request_id": str(request.id), "target_arrival_at": dispatch.target_arrival_at.isoformat()}, available_at=datetime.now(UTC)))
    await append_audit_event(session, actor_uid=actor.uid, action="PPH_BRIDGE_ACTIVATED", resource_type="dispatch", resource_id=dispatch.id, metadata={"ward": payload.ward, "clinical_registration": payload.clinical_owner_registration})
    await session.commit()
    return {"dispatch_id": str(dispatch.id), "status": dispatch.status, "target_arrival_at": dispatch.target_arrival_at.isoformat()}


@router.post("/platelets/schedule")
async def platelet_schedule(
    payload: PlateletScheduleRequest,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL", "ROLE_ORGANIZER"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, object]:
    candidates = [PlateletCandidate(item.donor_id, item.last_apheresis_at, item.vein_access_suitable, frozenset(item.available_days)) for item in payload.donors]
    assignments = stagger_three_day_schedule(candidates, payload.starts_at)
    for assignment in assignments:
        session.add(PlateletWindow(donor_id=assignment.donor_id, group_code=assignment.group_code, starts_at=assignment.starts_at, ends_at=assignment.ends_at))
        session.add(NotificationOutbox(topic=f"donor:{assignment.donor_id}", event_type="PLATELET_WINDOW_OFFERED", payload_json={"group": assignment.group_code, "starts_at": assignment.starts_at.isoformat(), "ends_at": assignment.ends_at.isoformat()}, available_at=datetime.now(UTC)))
    await append_audit_event(session, actor_uid=actor.uid, action="PLATELET_SCHEDULE_CREATED", resource_type="platelet_window", resource_id=None, metadata={"assignments": len(assignments)})
    await session.commit()
    return {"assignments": [{"donor_id": str(a.donor_id), "group": a.group_code, "starts_at": a.starts_at.isoformat(), "ends_at": a.ends_at.isoformat()} for a in assignments]}
