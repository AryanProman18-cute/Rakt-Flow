from datetime import UTC, date, datetime, timedelta
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import (
    BloodComponent,
    BloodUnit,
    CheckIn,
    ClinicalAssessment,
    DonationRecord,
    DonorProfile,
    Drive,
    DriveRegistration,
    Screening,
    User,
)
from app.schemas.accounts import (
    ClinicalAssessmentCreate,
    DonationRecordCreate,
    IntakeDonorView,
    ManualCheckInRequest,
    PreCheckSummary,
    ScanPassRequest,
)
from app.services.audit import append_audit_event
from app.services.clinical_safety import current_screening_is_approved
from app.services.components import default_expiry
from app.services.privacy import PrivacyVault
from app.services.tokens import DonorPassIssuer

router = APIRouter(prefix="/intake", tags=["organizer intake"])


def _age(born: date | None) -> int | None:
    if born is None:
        return None
    today = datetime.now(UTC).date()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


async def _authorize_drive(session: AsyncSession, actor: Actor, staff: User, drive_id: UUID) -> Drive:
    drive = await session.scalar(select(Drive).where(Drive.id == drive_id))
    if drive is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drive not found")
    if "ROLE_SUPER_ADMIN" not in actor.roles and drive.organizer_user_id != staff.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not assigned to this drive")
    if drive.status not in {"APPROVED", "ACTIVE"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Drive must be approved before donor intake")
    return drive


async def _mark_registration_checked_in(
    session: AsyncSession, *, drive_id: UUID, donor_id: UUID, checked_in_at: datetime
) -> None:
    registration = await session.scalar(
        select(DriveRegistration).where(
            DriveRegistration.drive_id == drive_id,
            DriveRegistration.donor_id == donor_id,
        ).with_for_update()
    )
    if registration is not None:
        registration.status = "CHECKED_IN"
        registration.checked_in_at = checked_in_at


async def _intake_view(
    session: AsyncSession,
    checkin: CheckIn,
    profile: DonorProfile,
    method: str,
    settings: Settings | None = None,
    screening: Screening | None = None,
) -> IntakeDonorView:
    if screening is None:
        screening = await session.scalar(
            select(Screening)
            .where(Screening.donor_id == profile.id)
            .order_by(Screening.created_at.desc())
            .limit(1)
        )
    summary = _precheck_summary(screening, profile.id, settings)
    return IntakeDonorView(
        checkin_id=checkin.id,
        donor_reference=profile.reference_code,
        display_name=profile.display_name,
        age=_age(profile.date_of_birth),
        blood_type=profile.blood_type,
        latest_screening_outcome=screening.outcome if screening else None,
        identity_verified=profile.identity_verified_at is not None,
        last_donation_date=profile.last_donation_date,
        clearance_status=checkin.clearance_status,
        checkin_method=method,
        screening=summary,
    )


def _precheck_summary(
    screening: Screening | None, donor_id: UUID, settings: Settings | None
) -> PreCheckSummary | None:
    """Decrypt and project the latest pre-check for authorised staff display.

    The donor pass token carries only identifiers; the clinical answers are
    retrieved server-side and never placed inside the QR payload.
    """
    if screening is None:
        return None
    answers: dict = {}
    if settings is not None and screening.encrypted_answers:
        try:
            vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
            answers = vault.decrypt_json(screening.encrypted_answers, context=f"screening:{donor_id}")
        except Exception:
            answers = {}
    field_names = (
        "questionnaire_version", "weight_kg", "feeling_well_today",
        "fever_infection_or_antibiotics", "medication_requires_review",
        "heart_lung_kidney_liver_or_bleeding_condition",
        "surgery_transfusion_or_hospitalization_last_12_months",
        "tattoo_or_piercing_last_12_months", "malaria_risk_travel_or_residence",
        "pregnancy_breastfeeding_or_recent_delivery",
        "alcohol_within_24_hours", "recent_immunization_14_days",
        "last_donation_date", "antibiotics_completed_date",
        "surgery_or_transfusion_date", "tattoo_or_piercing_date",
        "malaria_risk_return_date", "delivery_or_pregnancy_end_date",
        "eligible_on",
    )
    data = {name: answers.get(name) for name in field_names}
    data.update(
        outcome=screening.outcome,
        review_status=screening.review_status,
        flags=list(screening.flags or []),
        deferral_reason_codes=list(screening.deferral_reason_codes or []),
        eligible_on=screening.eligible_on,
        valid_until=screening.valid_until,
        attested_at=screening.attested_at,
    )
    return PreCheckSummary(**data)


@router.post("/scan", response_model=IntakeDonorView)
async def scan_donor_pass(
    payload: ScanPassRequest,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    staff: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> IntakeDonorView:
    await _authorize_drive(session, actor, staff, payload.drive_id)
    try:
        claims = DonorPassIssuer(settings.token_signing_secret).decode(payload.pass_token)
        donor_id = UUID(str(claims["sub"]))
        screening_id = UUID(str(claims["sid"]))
    except (jwt.InvalidTokenError, ValueError, KeyError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pass is invalid or expired") from exc
    profile = await session.scalar(select(DonorProfile).where(DonorProfile.id == donor_id))
    latest_screening = await session.scalar(
        select(Screening)
        .where(Screening.donor_id == donor_id)
        .order_by(Screening.created_at.desc())
        .limit(1)
    )
    if profile is None or not current_screening_is_approved(latest_screening, expected_id=screening_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Donor profile or approved screening is no longer current")
    existing = await session.scalar(select(CheckIn).where(CheckIn.idempotency_key == payload.idempotency_key))
    if existing:
        return await _intake_view(session, existing, profile, existing.checkin_method, settings, latest_screening)
    recent = await session.scalar(
        select(CheckIn)
        .where(
            CheckIn.drive_id == payload.drive_id,
            CheckIn.donor_id == profile.id,
            CheckIn.scanned_at > datetime.now(UTC) - timedelta(minutes=5),
        )
        .order_by(CheckIn.scanned_at.desc())
        .limit(1)
    )
    if recent is not None:
        # The same pass was just scanned (idempotent re-scan) — return the existing check-in.
        return await _intake_view(session, recent, profile, recent.checkin_method, settings, latest_screening)
    checkin = CheckIn(
        drive_id=payload.drive_id,
        donor_id=profile.id,
        scanner_user_id=staff.id,
        idempotency_key=payload.idempotency_key,
        scanned_at=datetime.now(UTC),
        clearance_status="PENDING_REVIEW",
        checkin_method="QR",
        source="ONLINE",
    )
    session.add(checkin)
    await session.flush()
    await _mark_registration_checked_in(
        session, drive_id=payload.drive_id, donor_id=profile.id, checked_in_at=checkin.scanned_at
    )
    await append_audit_event(session, actor_uid=actor.uid, action="DONOR_QR_CHECKED_IN", resource_type="checkin", resource_id=checkin.id, metadata={"drive_id": str(payload.drive_id)})
    await session.commit()
    return await _intake_view(session, checkin, profile, "QR", settings, latest_screening)


@router.post("/manual", response_model=IntakeDonorView)
async def manual_checkin(
    payload: ManualCheckInRequest,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    staff: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> IntakeDonorView:
    await _authorize_drive(session, actor, staff, payload.drive_id)
    profile = await session.scalar(
        select(DonorProfile).where(DonorProfile.reference_code == payload.donor_reference.strip().upper())
    )
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Donor reference not found")
    approved_screening = await session.scalar(
        select(Screening)
        .where(Screening.donor_id == profile.id)
        .order_by(Screening.created_at.desc())
        .limit(1)
    )
    if not current_screening_is_approved(approved_screening):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The donor needs a current pre-check approved for QR/intake eligibility",
        )
    existing = await session.scalar(select(CheckIn).where(CheckIn.idempotency_key == payload.idempotency_key))
    if existing:
        return await _intake_view(session, existing, profile, existing.checkin_method, settings, approved_screening)
    recent = await session.scalar(
        select(CheckIn)
        .where(
            CheckIn.drive_id == payload.drive_id,
            CheckIn.donor_id == profile.id,
            CheckIn.scanned_at > datetime.now(UTC) - timedelta(minutes=5),
        )
        .order_by(CheckIn.scanned_at.desc())
        .limit(1)
    )
    if recent is not None:
        return await _intake_view(session, recent, profile, recent.checkin_method, settings, approved_screening)
    checkin = CheckIn(
        drive_id=payload.drive_id,
        donor_id=profile.id,
        scanner_user_id=staff.id,
        idempotency_key=payload.idempotency_key,
        scanned_at=datetime.now(UTC),
        clearance_status="PENDING_REVIEW",
        checkin_method="MANUAL",
        source="ONLINE",
    )
    session.add(checkin)
    await session.flush()
    await _mark_registration_checked_in(
        session, drive_id=payload.drive_id, donor_id=profile.id, checked_in_at=checkin.scanned_at
    )
    await append_audit_event(session, actor_uid=actor.uid, action="DONOR_MANUAL_CHECKED_IN", resource_type="checkin", resource_id=checkin.id, metadata={"drive_id": str(payload.drive_id)})
    await session.commit()
    return await _intake_view(session, checkin, profile, "MANUAL", settings, approved_screening)


@router.post("/{checkin_id}/assessment")
async def record_clinical_assessment(
    checkin_id: UUID,
    payload: ClinicalAssessmentCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    assessor: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    checkin = await session.scalar(select(CheckIn).where(CheckIn.id == checkin_id).with_for_update())
    if checkin is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Check-in not found")
    existing = await session.scalar(select(ClinicalAssessment).where(ClinicalAssessment.checkin_id == checkin_id))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Clinical assessment is already recorded")
    measurements = {
        "hemoglobin_g_dl": payload.hemoglobin_g_dl,
        "systolic_bp": payload.systolic_bp,
        "diastolic_bp": payload.diastolic_bp,
        "pulse_bpm": payload.pulse_bpm,
    }
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    assessment = ClinicalAssessment(
        checkin_id=checkin.id,
        assessor_user_id=assessor.id,
        decision=payload.decision,
        reason_codes=payload.reason_codes,
        encrypted_measurements=vault.encrypt_json(measurements, context=f"assessment:{checkin.id}"),
        assessed_at=datetime.now(UTC),
    )
    session.add(assessment)
    checkin.clearance_status = payload.decision
    await append_audit_event(session, actor_uid=actor.uid, action=f"DONOR_{payload.decision}", resource_type="checkin", resource_id=checkin.id, metadata={"reason_codes": payload.reason_codes})
    await session.commit()
    return {"checkin_id": str(checkin.id), "decision": payload.decision}


@router.post("/{checkin_id}/donation", status_code=status.HTTP_201_CREATED)
async def record_donation(
    checkin_id: UUID,
    payload: DonationRecordCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER", "ROLE_HOSPITAL"))],
    staff: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    checkin = await session.scalar(select(CheckIn).where(CheckIn.id == checkin_id).with_for_update())
    if checkin is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Check-in not found")
    if checkin.clearance_status != "CLEARED":
        raise HTTPException(status.HTTP_409_CONFLICT, "A qualified clinical assessment must clear the donor first")
    existing = await session.scalar(select(DonationRecord).where(DonationRecord.checkin_id == checkin.id))
    if existing:
        return {"donation_id": str(existing.id), "unit_reference": existing.unit_reference, "duplicate": True}
    record = DonationRecord(
        checkin_id=checkin.id,
        donor_id=checkin.donor_id,
        drive_id=checkin.drive_id,
        recorded_by_user_id=staff.id,
        blood_type_at_collection=payload.blood_type_at_collection,
        component_type=payload.component_type,
        volume_ml=payload.volume_ml,
        collected_at=payload.collected_at,
        unit_reference=payload.unit_reference,
    )
    session.add(record)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Unit reference already exists") from exc
    profile = await session.scalar(select(DonorProfile).where(DonorProfile.id == checkin.donor_id).with_for_update())
    if profile:
        profile.last_donation_date = payload.collected_at.date()
    unit = BloodUnit(
        donation_record_id=record.id, donor_id=record.donor_id, drive_id=record.drive_id,
        unit_reference=record.unit_reference, blood_type=record.blood_type_at_collection,
        collected_at=record.collected_at, status="COLLECTED",
    )
    session.add(unit)
    await session.flush()
    session.add(BloodComponent(
        blood_unit_id=unit.id, parent_component_id=None,
        component_reference=record.unit_reference, isbt128_code=None,
        component_type=record.component_type, blood_type=record.blood_type_at_collection,
        volume_ml=record.volume_ml, collected_at=record.collected_at,
        prepared_at=record.collected_at,
        expires_at=default_expiry(record.component_type, record.collected_at),
        current_hospital_id=None, status="COLLECTED",
    ))
    await append_audit_event(session, actor_uid=actor.uid, action="DONATION_RECORDED", resource_type="donation_record", resource_id=record.id, metadata={"drive_id": str(checkin.drive_id), "component": payload.component_type})
    await session.commit()
    return {"donation_id": str(record.id), "unit_reference": record.unit_reference, "duplicate": False}
