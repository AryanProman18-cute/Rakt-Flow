from datetime import UTC, datetime
from typing import Annotated
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
    BloodRequest,
    DonationRecord,
    DonorAlert,
    DonorProfile,
    Drive,
    HospitalProfile,
    RequestStatus,
    Screening,
    User,
)
from app.schemas.api import DonorPassResponse
from app.services.audit import append_audit_event
from app.services.tokens import DonorPassIssuer

router = APIRouter(prefix="/donors", tags=["donors"])


class AlertResponse(BaseModel):
    response: str


@router.get("/me/pass", response_model=DonorPassResponse)
async def donor_pass(
    actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DonorPassResponse:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    if donor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Donor profile not found")
    screening = await session.scalar(
        select(Screening)
        .where(Screening.donor_id == donor.id, Screening.valid_until > datetime.now(UTC))
        .order_by(Screening.created_at.desc())
        .limit(1)
    )
    if screening is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A current pre-screening is required")
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
    return [
        {
            "id": str(record.id), "drive_name": drive_name, "venue_name": venue_name,
            "blood_type": record.blood_type_at_collection, "component_type": record.component_type,
            "volume_ml": record.volume_ml, "collected_at": record.collected_at,
            "unit_reference": record.unit_reference,
        }
        for record, drive_name, venue_name in rows
    ]


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
    return [
        {
            "id": str(alert.id), "request_id": str(request.id), "facility_name": facility,
            "blood_type": request.blood_type, "phenotype_code": request.phenotype_code,
            "component_type": request.component_type, "units_needed": request.units_needed,
            "urgency": request.urgency.value, "expires_at": request.expires_at,
            "response": alert.response, "response_deadline": alert.response_deadline,
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
    if payload.response not in {"ACCEPTED", "DECLINED"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Response must be ACCEPTED or DECLINED")
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    alert = await session.scalar(select(DonorAlert).where(DonorAlert.id == alert_id).with_for_update())
    if donor is None or alert is None or alert.donor_id != donor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.response != "PENDING" or alert.response_deadline < datetime.now(UTC):
        raise HTTPException(status.HTTP_409_CONFLICT, "This response window is no longer active")
    alert.response = payload.response
    alert.responded_at = datetime.now(UTC)
    await append_audit_event(
        session, actor_uid=actor.uid, action=f"DONOR_ALERT_{payload.response}",
        resource_type="donor_alert", resource_id=alert.id,
    )
    await session.commit()
    return {"alert_id": str(alert.id), "response": alert.response}
