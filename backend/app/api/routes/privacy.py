import base64
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, current_actor, require_roles
from app.models.entities import (
    ConsentRecord,
    DataRightsRequest,
    DonationRecord,
    DonorProfile,
    Drive,
    Screening,
    ScreeningReviewAssignment,
    User,
    UserPreference,
)
from app.services.audit import append_audit_event
from app.services.privacy import PrivacyVault

router = APIRouter(prefix="/privacy", tags=["privacy and data rights"])


class RightsRequestCreate(BaseModel):
    request_type: Literal[
        "ACCESS", "CORRECTION", "ERASURE", "CONSENT_WITHDRAWAL", "NOMINATION", "GRIEVANCE"
    ]
    details: str = Field(min_length=10, max_length=2000)


class RightsRequestDecision(BaseModel):
    status: Literal["IN_REVIEW", "COMPLETED", "REJECTED"]
    resolution_note: str = Field(min_length=3, max_length=1000)


def consent_view(row: ConsentRecord) -> dict:
    return {
        "id": str(row.id), "purpose_code": row.purpose_code, "granted": row.granted,
        "notice_version": row.notice_version, "captured_at": row.captured_at,
        "withdrawn_at": row.withdrawn_at, "source": row.source,
    }


def request_view(row: DataRightsRequest, details: str | None = None) -> dict:
    return {
        "id": str(row.id), "request_type": row.request_type, "status": row.status,
        "created_at": row.created_at, "due_at": row.due_at,
        "resolved_at": row.resolved_at, "resolution_note": row.resolution_note,
        "details": details,
        "notice": "Operational, safety, legal-hold and immutable audit records may require restricted retention rather than immediate deletion.",
    }


@router.get("/me/consents")
async def my_consents(
    _actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    rows = (await session.scalars(
        select(ConsentRecord).where(ConsentRecord.user_id == user.id)
        .order_by(ConsentRecord.captured_at.desc()).limit(250)
    )).all()
    return [consent_view(row) for row in rows]


@router.get("/me/requests")
async def my_rights_requests(
    _actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    rows = (await session.scalars(
        select(DataRightsRequest).where(DataRightsRequest.user_id == user.id)
        .order_by(DataRightsRequest.created_at.desc()).limit(100)
    )).all()
    return [request_view(row) for row in rows]


@router.post("/me/requests", status_code=status.HTTP_201_CREATED)
async def submit_rights_request(
    payload: RightsRequestCreate,
    actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    duplicate = await session.scalar(select(DataRightsRequest.id).where(
        DataRightsRequest.user_id == user.id,
        DataRightsRequest.request_type == payload.request_type,
        DataRightsRequest.status.in_(["SUBMITTED", "IN_REVIEW"]),
    ).limit(1))
    if duplicate:
        raise HTTPException(status.HTTP_409_CONFLICT, "An open request of this type already exists")
    now = datetime.now(UTC)
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    row = DataRightsRequest(
        user_id=user.id, request_type=payload.request_type, status="SUBMITTED",
        details_encrypted=vault.encrypt_bytes(
            payload.details.strip().encode(),
            context=f"data-rights:{user.id}:{payload.request_type}",
        ),
        due_at=now + timedelta(days=settings.data_rights_response_days),
    )
    session.add(row)
    await session.flush()
    if payload.request_type == "CONSENT_WITHDRAWAL":
        preference = await session.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
        if preference:
            preference.rare_blood_opt_in = False
            preference.location_matching_opt_in = False
            preference.email_notifications = False
            preference.sms_notifications = False
            preference.donation_lifecycle_opt_in = False
        donor = await session.scalar(
            select(DonorProfile).where(DonorProfile.user_id == user.id)
        )
        if donor:
            donor.location = None
            screening_ids = select(Screening.id).where(Screening.donor_id == donor.id)
            await session.execute(
                update(ScreeningReviewAssignment)
                .where(
                    ScreeningReviewAssignment.screening_id.in_(screening_ids),
                    ScreeningReviewAssignment.status == "ACTIVE",
                )
                .values(status="REVOKED")
            )
        session.add(ConsentRecord(
            user_id=user.id, purpose_code="OPTIONAL_PROCESSING_WITHDRAWAL",
            granted=False, notice_version="DPDP-PLAIN-2026-01", captured_at=now,
            withdrawn_at=now, source="PRIVACY_REQUEST",
            metadata_json={"request_id": str(row.id)},
        ))
    await append_audit_event(
        session, actor_uid=actor.uid, action="DATA_RIGHTS_REQUEST_SUBMITTED",
        resource_type="data_rights_request", resource_id=row.id,
        metadata={"request_type": row.request_type},
    )
    await session.commit()
    return request_view(row)


@router.get("/me/export")
async def export_my_data(
    _actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    donor = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id))
    preference = await session.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    consents = (await session.scalars(
        select(ConsentRecord).where(ConsentRecord.user_id == user.id)
        .order_by(ConsentRecord.captured_at)
    )).all()
    donations = []
    if donor:
        rows = (await session.execute(
            select(DonationRecord, Drive.name, Drive.venue_name)
            .join(Drive, Drive.id == DonationRecord.drive_id)
            .where(DonationRecord.donor_id == donor.id)
            .order_by(DonationRecord.collected_at)
        )).all()
        donations = [{
            "unit_reference": record.unit_reference, "blood_type": record.blood_type_at_collection,
            "component_type": record.component_type, "volume_ml": record.volume_ml,
            "collected_at": record.collected_at, "drive_name": drive_name,
            "venue_name": venue_name,
        } for record, drive_name, venue_name in rows]
    phone = None
    if donor and donor.phone_encrypted:
        vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
        phone = vault.decrypt_bytes(
            base64.urlsafe_b64decode(donor.phone_encrypted), context=f"donor-phone:{user.id}"
        ).decode()
    await append_audit_event(
        session, actor_uid=_actor.uid, action="PERSONAL_DATA_EXPORTED",
        resource_type="user", resource_id=user.id,
    )
    await session.commit()
    return {
        "generated_at": datetime.now(UTC),
        "account": {"email": user.email, "active": user.active, "created_at": user.created_at},
        "donor_profile": ({
            "reference_code": donor.reference_code, "display_name": donor.display_name,
            "date_of_birth": donor.date_of_birth, "phone": phone, "city": donor.city,
            "blood_type": donor.blood_type, "profile_status": donor.profile_status,
            "location_precision": "APPROXIMATE_AREA_ONLY" if donor.location is not None else "NOT_STORED",
        } if donor else None),
        "preferences": ({column: getattr(preference, column) for column in [
            "appearance", "language", "in_app_notifications", "email_notifications",
            "sms_notifications", "rare_blood_opt_in", "location_matching_opt_in",
            "donation_lifecycle_opt_in",
        ]} if preference else None),
        "consents": [consent_view(row) for row in consents],
        "donations": donations,
    }


@router.get("/admin/requests")
async def admin_rights_requests(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[dict]:
    rows = (await session.scalars(
        select(DataRightsRequest).order_by(DataRightsRequest.created_at.desc()).limit(500)
    )).all()
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    output = []
    for row in rows:
        details = vault.decrypt_bytes(
            row.details_encrypted,
            context=f"data-rights:{row.user_id}:{row.request_type}",
        ).decode()
        request_user = await session.get(User, row.user_id)
        output.append(request_view(row, details) | {
            "user_id": str(row.user_id),
            "user_email": request_user.email if request_user else None,
        })
    return output


@router.patch("/admin/requests/{request_id}")
async def decide_rights_request(
    request_id: UUID,
    payload: RightsRequestDecision,
    actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    row = await session.scalar(
        select(DataRightsRequest).where(DataRightsRequest.id == request_id).with_for_update()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Data-rights request not found")
    if row.status in {"COMPLETED", "REJECTED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "This request is already finalized")
    row.status = payload.status
    row.resolution_note = payload.resolution_note.strip()
    row.resolved_at = datetime.now(UTC) if payload.status in {"COMPLETED", "REJECTED"} else None
    await append_audit_event(
        session, actor_uid=actor.uid, action=f"DATA_RIGHTS_REQUEST_{payload.status}",
        resource_type="data_rights_request", resource_id=row.id,
    )
    await session.commit()
    return request_view(row)
