from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import (
    BloodComponent,
    BloodRequest,
    BloodUnit,
    DonationRecord,
    DonorAlert,
    DonorProfile,
    DonorUnitNotification,
    Drive,
    HospitalProfile,
    NotificationOutbox,
    RequestStatus,
    Screening,
    User,
)
from app.schemas.api import DonorPassResponse
from app.services.audit import append_audit_event
from app.services.clinical_safety import current_screening_is_approved
from app.services.tokens import DonorPassIssuer

router = APIRouter(prefix="/donors", tags=["donors"])


class AlertResponse(BaseModel):
    response: Literal["ACCEPTED", "DECLINED"]


@router.get("/me/pass", response_model=DonorPassResponse)
async def donor_pass(
    actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DonorPassResponse:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    if donor is None or donor.profile_status != "COMPLETE":
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete your donor profile before requesting a pass")
    if donor.blood_type == "UNKNOWN":
        raise HTTPException(status.HTTP_409_CONFLICT, "Select your self-reported blood group before requesting a pass")
    screening = await session.scalar(
        select(Screening)
        .where(Screening.donor_id == donor.id)
        .order_by(Screening.created_at.desc())
        .limit(1)
    )
    if not current_screening_is_approved(screening):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The latest current pre-check must be approved by an authorized clinical reviewer",
        )
    issued = DonorPassIssuer(settings.token_signing_secret).issue(str(donor.id), str(screening.id))
    return DonorPassResponse(**issued)


@router.get("/me/donations")
async def donation_history(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    if donor is None:
        return []
    rows = (
        await session.execute(
            select(DonationRecord, Drive.name, Drive.venue_name)
            .join(Drive, Drive.id == DonationRecord.drive_id)
            .where(DonationRecord.donor_id == donor.id)
            .order_by(DonationRecord.collected_at.desc()).limit(100)
        )
    ).all()
    history = []
    for record, drive_name, venue_name in rows:
        unit = await session.scalar(select(BloodUnit).where(BloodUnit.donation_record_id == record.id))
        components = []
        if unit:
            component_rows = (await session.scalars(
                select(BloodComponent).where(BloodComponent.blood_unit_id == unit.id)
                .order_by(BloodComponent.prepared_at)
            )).all()
            components = [{
                "component_type": item.component_type,
                "status": item.status,
                "collected_at": item.collected_at,
                "prepared_at": item.prepared_at,
                "privacy_message": (
                    "Recorded as used by an authorized facility; patient identity is never shown."
                    if item.status == "TRANSFUSED" else None
                ),
            } for item in component_rows]
        history.append({
            "id": str(record.id), "drive_name": drive_name, "venue_name": venue_name,
            "blood_type": record.blood_type_at_collection, "component_type": record.component_type,
            "volume_ml": record.volume_ml, "collected_at": record.collected_at,
            "unit_reference": record.unit_reference, "components": components,
        })
    return history


@router.get("/me/unit-notifications")
async def unit_notifications(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    if donor is None:
        return []
    rows = (await session.scalars(
        select(DonorUnitNotification).where(DonorUnitNotification.donor_id == donor.id)
        .order_by(DonorUnitNotification.created_at.desc()).limit(100)
    )).all()
    return [{
        "id": str(row.id), "event_type": row.event_type, "message": row.safe_message,
        "created_at": row.created_at, "read_at": row.read_at,
    } for row in rows]


@router.post("/me/unit-notifications/{notification_id}/read")
async def read_unit_notification(
    notification_id: UUID,
    _actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    row = await session.scalar(select(DonorUnitNotification).where(DonorUnitNotification.id == notification_id))
    if donor is None or row is None or row.donor_id != donor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    row.read_at = row.read_at or datetime.now(UTC)
    await session.commit()
    return {"id": str(row.id), "read_at": row.read_at}


@router.get("/me/alerts")
async def my_verified_alerts(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    if donor is None:
        return []
    rows = (
        await session.execute(
            select(DonorAlert, BloodRequest, HospitalProfile.facility_name)
            .join(BloodRequest, BloodRequest.id == DonorAlert.request_id)
            .join(HospitalProfile, HospitalProfile.user_id == BloodRequest.hospital_user_id)
            .where(DonorAlert.donor_id == donor.id, BloodRequest.status == RequestStatus.VERIFIED)
            .order_by(DonorAlert.created_at.desc()).limit(50)
        )
    ).all()
    now = datetime.now(UTC)
    return [
        {
            "id": str(alert.id), "request_id": str(request.id), "facility_name": facility,
            "blood_type": request.blood_type, "phenotype_code": request.phenotype_code,
            "component_type": request.component_type, "units_needed": request.units_needed,
            "urgency": request.urgency.value, "expires_at": request.expires_at,
            "tier": alert.tier, "radius_km": alert.radius_km,
            "response": (
                "EXPIRED"
                if alert.response == "PENDING" and alert.response_deadline <= now
                else alert.response
            ),
            "response_deadline": alert.response_deadline,
            "responded_at": alert.responded_at,
            "can_respond": (
                alert.response == "PENDING"
                and alert.response_deadline > now
                and request.expires_at > now
            ),
            "privacy_notice": "No patient identity is included.",
        }
        for alert, request, facility in rows
    ]


@router.post("/me/alerts/{alert_id}/response")
async def respond_to_alert(
    alert_id: UUID,
    payload: AlertResponse,
    actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    alert = await session.scalar(select(DonorAlert).where(DonorAlert.id == alert_id).with_for_update())
    if donor is None or alert is None or alert.donor_id != donor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    request = await session.scalar(select(BloodRequest).where(BloodRequest.id == alert.request_id))
    now = datetime.now(UTC)
    if (
        request is None
        or request.status is not RequestStatus.VERIFIED
        or request.expires_at <= now
        or alert.response != "PENDING"
        or alert.response_deadline <= now
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "This response window is no longer active")
    alert.response = payload.response
    alert.responded_at = now
    session.add(NotificationOutbox(
        topic=f"hospital:{request.hospital_user_id}:rare-response",
        event_type="RARE_STANDBY_RESPONSE_RECORDED",
        payload_json={
            "request_id": str(request.id), "alert_id": str(alert.id),
            "donor_reference": donor.reference_code, "response": payload.response,
            "privacy_notice": "No donor health answers or patient identity are included.",
        },
        available_at=now,
    ))
    await append_audit_event(
        session, actor_uid=actor.uid, action=f"DONOR_ALERT_{payload.response}",
        resource_type="donor_alert", resource_id=alert.id,
        metadata={"request_id": str(request.id)},
    )
    await session.commit()
    return {"alert_id": str(alert.id), "response": alert.response, "responded_at": alert.responded_at}
