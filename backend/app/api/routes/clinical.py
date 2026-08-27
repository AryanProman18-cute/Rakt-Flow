from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import (
    DonorProfile,
    HospitalProfile,
    Screening,
    ScreeningReviewAssignment,
    User,
)
from app.schemas.accounts import PreCheckSummary
from app.schemas.integrated import ScreeningReview
from app.services.audit import append_audit_event
from app.services.privacy import PrivacyVault

router = APIRouter(prefix="/clinical", tags=["clinical review"])


async def _current_review_facility(
    session: AsyncSession, user_id: UUID
) -> HospitalProfile | None:
    """Return this user's verified facility, or None for platform-admin review."""
    profile = await session.scalar(
        select(HospitalProfile).where(HospitalProfile.user_id == user_id)
    )
    if profile is None:
        return None
    if profile.status != "VERIFIED":
        raise HTTPException(
            403, "A verified hospital or blood-bank profile is required for clinical review"
        )
    return profile


def _age(born: date | None) -> int | None:
    if born is None:
        return None
    today = datetime.now(UTC).date()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def _precheck_summary(screening: Screening, donor_id: UUID, settings: Settings) -> PreCheckSummary:
    answers: dict = {}
    if screening.encrypted_answers:
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


def _view(screening: Screening, donor: DonorProfile, settings: Settings) -> dict:
    return {
        "screening_id": str(screening.id),
        "donor_reference": donor.reference_code,
        "age": _age(donor.date_of_birth),
        "blood_type": donor.blood_type,
        "city": donor.city,
        "outcome": screening.outcome,
        "flags": screening.flags,
        "attested_at": screening.attested_at,
        "valid_until": screening.valid_until,
        "review_status": screening.review_status,
        "reviewed_at": screening.reviewed_at,
        "review_note": screening.review_note,
        "eligible_on": screening.eligible_on,
        "deferral_reason_codes": screening.deferral_reason_codes,
        "screening": _precheck_summary(screening, donor.id, settings).model_dump(mode="json"),
    }


@router.get("/screenings")
async def list_screening_queue(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL", "ROLE_SUPER_ADMIN"))],
    reviewer: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    review_status: str = "PENDING",
) -> list[dict]:
    facility = await _current_review_facility(session, reviewer.id)
    normalized = review_status.upper()
    if normalized not in {"PENDING", "APPROVED", "DECLINED", "ALL"}:
        raise HTTPException(422, "Unknown screening review status")
    base = select(Screening, DonorProfile).join(
        DonorProfile, DonorProfile.id == Screening.donor_id
    )
    if facility is not None:
        base = base.join(
            ScreeningReviewAssignment,
            ScreeningReviewAssignment.screening_id == Screening.id,
        ).where(
            ScreeningReviewAssignment.hospital_id == facility.id,
            ScreeningReviewAssignment.status == "ACTIVE",
        )
    if normalized != "ALL":
        base = base.where(Screening.review_status == normalized)
    rows = (
        await session.execute(
            base.order_by(Screening.created_at.desc()).limit(250)
        )
    ).all()
    return [_view(screening, donor, settings) for screening, donor in rows]


@router.post("/screenings/{screening_id}/decision")
async def review_screening(
    screening_id: UUID,
    payload: ScreeningReview,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL", "ROLE_SUPER_ADMIN"))],
    reviewer: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    facility = await _current_review_facility(session, reviewer.id)
    base = (
        select(Screening, DonorProfile)
        .join(DonorProfile, DonorProfile.id == Screening.donor_id)
        .where(Screening.id == screening_id)
    )
    if facility is not None:
        base = (
            base.join(
                ScreeningReviewAssignment,
                ScreeningReviewAssignment.screening_id == Screening.id,
            )
            .where(
                ScreeningReviewAssignment.hospital_id == facility.id,
                ScreeningReviewAssignment.status == "ACTIVE",
            )
        )
    row = (await session.execute(base.with_for_update())).first()
    if row is None:
        raise HTTPException(404, "Screening not found or not assigned to your facility")
    screening, donor = row
    if screening.review_status != "PENDING":
        raise HTTPException(409, "This screening already has a reviewer decision")
    if screening.valid_until <= datetime.now(UTC):
        raise HTTPException(409, "This screening has expired; ask the donor to submit a new pre-check")
    if (
        payload.decision == "APPROVED"
        and screening.eligible_on
        and screening.eligible_on > datetime.now(UTC).date()
    ):
        raise HTTPException(
            409,
            f"The configured temporary-deferral countdown remains active until {screening.eligible_on.isoformat()}",
        )
    screening.review_status = payload.decision
    screening.reviewed_by_user_id = reviewer.id
    screening.reviewed_at = datetime.now(UTC)
    screening.review_note = payload.note.strip() or None
    await append_audit_event(
        session,
        actor_uid=actor.uid,
        action=f"SCREENING_QR_{payload.decision}",
        resource_type="screening",
        resource_id=screening.id,
        metadata={
            "donor_reference": donor.reference_code,
            "review_hospital_id": str(facility.id) if facility else None,
            "reviewer_role": "HOSPITAL" if facility else "SUPER_ADMIN",
        },
    )
    await session.commit()
    return _view(screening, donor, settings)
