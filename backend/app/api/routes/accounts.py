from datetime import UTC, date, datetime, timedelta
from secrets import token_hex
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from sqlalchemy import cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, current_actor, require_roles
from app.models.entities import (
    ConsentRecord,
    DonorProfile,
    HospitalProfile,
    Invitation,
    Screening,
    ScreeningReviewAssignment,
    User,
    UserPreference,
    UserRole,
)
from app.schemas.accounts import (
    BootstrapResponse,
    DonorProfileUpsert,
    DonorProfileView,
    ScreeningResult,
    ScreeningSubmission,
)
from app.services.audit import append_audit_event
from app.services.privacy import PrivacyVault, normalize_phone
from app.services.roles import active_roles, push_firebase_claims, replace_roles

router = APIRouter(tags=["accounts and donor profile"])


def age_on(born: date, on: date | None = None) -> int:
    on = on or datetime.now(UTC).date()
    return on.year - born.year - ((on.month, on.day) < (born.month, born.day))


def mask_phone(normalized: str) -> str:
    return f"{normalized[:3]}••••••{normalized[-3:]}"


@router.post("/auth/bootstrap", response_model=BootstrapResponse)
async def bootstrap_account(
    actor: Annotated[Actor, Depends(current_actor)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> BootstrapResponse:
    if not actor.email or not actor.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "A verified email address is required")

    user = await session.scalar(
        select(User).where(or_(User.firebase_uid == actor.uid, User.email == actor.email)).with_for_update()
    )
    if user and user.firebase_uid != actor.uid:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already bound to another identity")
    created = user is None
    if user is None:
        user = User(firebase_uid=actor.uid, email=actor.email, role=UserRole.DONOR, is_active=True)
        session.add(user)
        await session.flush()
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account has been disabled")

    roles = await active_roles(session, user.id)
    invitation = await session.scalar(
        select(Invitation)
        .where(
            Invitation.email == actor.email,
            Invitation.status == "PENDING",
            Invitation.expires_at > datetime.now(UTC),
        )
        .order_by(Invitation.created_at.desc())
        .with_for_update()
        .limit(1)
    )
    bootstrap_admin = actor.email == settings.bootstrap_admin_email.strip().lower()
    if bootstrap_admin:
        roles = {
            "ROLE_SUPER_ADMIN",
            "ROLE_DONOR",
            "ROLE_ORGANIZER",
            "ROLE_HOSPITAL",
            "ROLE_HOST_VENUE",
        }
    elif invitation:
        roles.update(invitation.roles)
        invitation.status = "ACCEPTED"
        invitation.accepted_at = datetime.now(UTC)
    elif created or not roles:
        roles = {"ROLE_DONOR"}

    await replace_roles(session, user, roles, granted_by_user_id=None)
    await append_audit_event(
        session,
        actor_uid=actor.uid,
        action="ACCOUNT_BOOTSTRAPPED",
        resource_type="user",
        resource_id=user.id,
        metadata={"roles": sorted(roles), "invitation": bool(invitation)},
    )
    await session.commit()
    await push_firebase_claims(user, roles)

    profile = await session.scalar(select(DonorProfile.id).where(DonorProfile.user_id == user.id))
    return BootstrapResponse(
        user_id=user.id,
        email=actor.email,
        roles=sorted(roles),
        needs_profile="ROLE_DONOR" in roles and profile is None,
    )


@router.get("/donors/me/profile", response_model=DonorProfileView)
async def get_donor_profile(
    actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DonorProfileView:
    user = await session.scalar(select(User).where(User.firebase_uid == actor.uid))
    profile_row = None
    if user:
        location_geometry = cast(DonorProfile.location, Geometry("POINT", srid=4326))
        profile_row = (
            await session.execute(
                select(
                    DonorProfile,
                    func.ST_Y(location_geometry).label("latitude"),
                    func.ST_X(location_geometry).label("longitude"),
                ).where(DonorProfile.user_id == user.id)
            )
        ).one_or_none()
    if profile_row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Donor profile is not complete")
    profile, latitude, longitude = profile_row
    screening = await session.scalar(
        select(Screening).where(Screening.donor_id == profile.id).order_by(Screening.created_at.desc()).limit(1)
    )
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    normalized_phone = vault.decrypt_bytes(
        __import__("base64").urlsafe_b64decode(profile.phone_encrypted), context=f"donor-phone:{user.id}"
    ).decode() if profile.phone_encrypted else ""
    return DonorProfileView(
        reference_code=profile.reference_code,
        full_name=profile.display_name,
        date_of_birth=profile.date_of_birth,
        age=age_on(profile.date_of_birth) if profile.date_of_birth else None,
        phone=normalized_phone,
        phone_masked=mask_phone(normalized_phone) if normalized_phone else "Not provided",
        city=profile.city,
        latitude=latitude,
        longitude=longitude,
        blood_type=profile.blood_type,
        profile_status=profile.profile_status,
        identity_verified=profile.identity_verified_at is not None,
        latest_screening_outcome=screening.outcome if screening else None,
        screening_review_status=screening.review_status if screening else None,
        screening_valid_until=screening.valid_until if screening else None,
        eligible_on=screening.eligible_on if screening else None,
        deferral_reason_codes=screening.deferral_reason_codes if screening else [],
    )


@router.put("/donors/me/profile", response_model=DonorProfileView)
async def upsert_donor_profile(
    payload: DonorProfileUpsert,
    actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DonorProfileView:
    if not payload.consent_to_process:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Data-processing consent is required")
    donor_age = age_on(payload.date_of_birth)
    if donor_age < settings.screening_min_age:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Donor registration is limited to adults aged {settings.screening_min_age} or older",
        )
    if payload.latitude is None or payload.longitude is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Choose a location so the server can store an approximate nearby-matching area",
        )
    user = await session.scalar(select(User).where(User.firebase_uid == actor.uid))
    if user is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete account bootstrap first")
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    normalized_phone = normalize_phone(payload.phone)
    profile = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id).with_for_update())
    if profile is None:
        profile = DonorProfile(
            user_id=user.id,
            reference_code=f"RF-{token_hex(4).upper()}",
            display_name=payload.full_name,
            phone_hash=vault.keyed_hash(normalized_phone),
            blood_type=payload.blood_type,
        )
        session.add(profile)
    profile.display_name = payload.full_name.strip()
    profile.date_of_birth = payload.date_of_birth
    profile.phone_hash = vault.keyed_hash(normalized_phone)
    profile.phone_encrypted = vault.encrypt_text(normalized_phone, context=f"donor-phone:{user.id}")
    profile.city = payload.city.strip()
    approximate_latitude = None
    approximate_longitude = None
    if payload.latitude is not None and payload.longitude is not None:
        # Exact browser coordinates are used only in this request. Persist a broad
        # grid point suitable for nearby results, not a street-level donor location.
        grid_degrees = 0.02
        approximate_latitude = round(payload.latitude / grid_degrees) * grid_degrees
        approximate_longitude = round(payload.longitude / grid_degrees) * grid_degrees
        profile.location = ST_SetSRID(
            ST_MakePoint(approximate_longitude, approximate_latitude), 4326
        )
    profile.blood_type = payload.blood_type
    profile.profile_status = "COMPLETE"
    profile.consent_at = profile.consent_at or datetime.now(UTC)
    existing_core_consent = await session.scalar(
        select(ConsentRecord.id).where(
            ConsentRecord.user_id == user.id,
            ConsentRecord.purpose_code == "DONOR_REGISTRATION_AND_SAFETY",
            ConsentRecord.granted.is_(True),
        ).limit(1)
    )
    if existing_core_consent is None:
        session.add(ConsentRecord(
            user_id=user.id,
            purpose_code="DONOR_REGISTRATION_AND_SAFETY",
            granted=True,
            notice_version="DPDP-PLAIN-2026-01",
            captured_at=datetime.now(UTC),
            source="PROFILE",
            metadata_json={"required": True},
        ))
    if approximate_latitude is not None:
        existing_location_consent = await session.scalar(
            select(ConsentRecord.id).where(
                ConsentRecord.user_id == user.id,
                ConsentRecord.purpose_code == "OPTIONAL_NEARBY_LOCATION_MATCHING",
                ConsentRecord.granted.is_(True),
            ).limit(1)
        )
        if existing_location_consent is None:
            session.add(ConsentRecord(
                user_id=user.id,
                purpose_code="OPTIONAL_NEARBY_LOCATION_MATCHING",
                granted=True,
                notice_version="DPDP-PLAIN-2026-01",
                captured_at=datetime.now(UTC),
                source="PROFILE",
                metadata_json={"precision": "APPROXIMATE_2KM_GRID"},
            ))
        preference = await session.scalar(
            select(UserPreference).where(UserPreference.user_id == user.id)
        )
        if preference is None:
            preference = UserPreference(user_id=user.id)
            session.add(preference)
        preference.location_matching_opt_in = True
    await append_audit_event(session, actor_uid=actor.uid, action="DONOR_PROFILE_UPDATED", resource_type="donor_profile", resource_id=profile.id)
    await session.commit()
    return DonorProfileView(
        reference_code=profile.reference_code,
        full_name=profile.display_name,
        date_of_birth=profile.date_of_birth,
        age=age_on(profile.date_of_birth),
        phone=normalized_phone,
        phone_masked=mask_phone(normalized_phone),
        city=profile.city,
        latitude=approximate_latitude,
        longitude=approximate_longitude,
        blood_type=profile.blood_type,
        profile_status=profile.profile_status,
        identity_verified=profile.identity_verified_at is not None,
        latest_screening_outcome=None,
        screening_review_status=None,
        screening_valid_until=None,
        eligible_on=None,
        deferral_reason_codes=[],
    )


def calculated_deferral_window(
    payload: ScreeningSubmission, settings: Settings
) -> tuple[date | None, list[str]]:
    candidates: list[date] = []
    reasons: list[str] = []

    def add(condition: bool | None, event_date: date | None, days: int, code: str) -> None:
        if not condition:
            return
        reasons.append(code)
        if event_date:
            candidates.append(event_date + timedelta(days=days))
        else:
            reasons.append(f"{code}_DATE_REQUIRED")

    add(payload.fever_infection_or_antibiotics, payload.antibiotics_completed_date,
        settings.screening_antibiotic_review_days, "ANTIBIOTIC_OR_INFECTION_REVIEW")
    add(payload.surgery_transfusion_or_hospitalization_last_12_months,
        payload.surgery_or_transfusion_date, settings.screening_surgery_review_days,
        "SURGERY_OR_TRANSFUSION_REVIEW")
    add(payload.tattoo_or_piercing_last_12_months, payload.tattoo_or_piercing_date,
        settings.screening_tattoo_review_days, "TATTOO_OR_PIERCING_REVIEW")
    add(payload.malaria_risk_travel_or_residence, payload.malaria_risk_return_date,
        settings.screening_malaria_review_days, "MALARIA_TRAVEL_REVIEW")
    add(payload.pregnancy_breastfeeding_or_recent_delivery,
        payload.delivery_or_pregnancy_end_date, settings.screening_delivery_review_days,
        "PREGNANCY_OR_DELIVERY_REVIEW")
    if payload.last_donation_date:
        reasons.append("DONATION_INTERVAL_REVIEW")
        candidates.append(payload.last_donation_date + timedelta(
            days=settings.screening_whole_blood_interval_days
        ))
    return max(candidates, default=None), sorted(set(reasons))


@router.post("/donors/me/screenings", response_model=ScreeningResult, status_code=status.HTTP_201_CREATED)
async def submit_screening(
    payload: ScreeningSubmission,
    actor: Annotated[Actor, Depends(require_roles("ROLE_DONOR"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ScreeningResult:
    if not (
        payload.answers_are_truthful
        and payload.consent_to_clinical_review
        and payload.consent_to_selected_facility_review
    ):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Attestation and explicit selected-facility review consent are required",
        )
    review_hospital = await session.get(HospitalProfile, payload.review_hospital_id)
    if review_hospital is None or review_hospital.status != "VERIFIED":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Choose a verified hospital or blood bank for confidential review",
        )
    user = await session.scalar(select(User).where(User.firebase_uid == actor.uid))
    profile = await session.scalar(select(DonorProfile).where(DonorProfile.user_id == user.id)) if user else None
    if profile is None or profile.date_of_birth is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete donor profile before screening")

    flags: list[str] = []
    donor_age = age_on(profile.date_of_birth)
    if donor_age < settings.screening_min_age:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Online donor screening is restricted to adults aged {settings.screening_min_age} or older",
        )
    if donor_age > settings.screening_max_age:
        flags.append("AGE_REQUIRES_REVIEW")
    if payload.weight_kg < settings.screening_min_weight_kg:
        flags.append("WEIGHT_BELOW_CONFIGURED_THRESHOLD")
    if not payload.feeling_well_today or payload.fever_infection_or_antibiotics:
        flags.append("CURRENT_HEALTH_REQUIRES_REVIEW")
    if payload.medication_requires_review:
        flags.append("MEDICATION_REQUIRES_REVIEW")
    if payload.heart_lung_kidney_liver_or_bleeding_condition:
        flags.append("MEDICAL_HISTORY_REQUIRES_REVIEW")
    if payload.surgery_transfusion_or_hospitalization_last_12_months:
        flags.append("RECENT_PROCEDURE_REQUIRES_REVIEW")
    if payload.tattoo_or_piercing_last_12_months:
        flags.append("RECENT_TATTOO_PIERCING_REQUIRES_REVIEW")
    if payload.malaria_risk_travel_or_residence:
        flags.append("TRAVEL_REQUIRES_REVIEW")
    if payload.pregnancy_breastfeeding_or_recent_delivery:
        flags.append("PREGNANCY_RELATED_REVIEW")
    if payload.last_donation_date and datetime.now(UTC).date() - payload.last_donation_date < timedelta(days=settings.screening_whole_blood_interval_days):
        flags.append("RECENT_DONATION_REQUIRES_REVIEW")

    eligible_on, deferral_reason_codes = calculated_deferral_window(payload, settings)
    if eligible_on and eligible_on > datetime.now(UTC).date():
        flags.append("TEMPORARY_DEFERRAL_COUNTDOWN_ACTIVE")
    if any(code.endswith("_DATE_REQUIRED") for code in deferral_reason_codes):
        flags.append("DEFERRAL_DATE_REQUIRES_CLINICAL_REVIEW")

    deferral_flags = {
        "AGE_REQUIRES_REVIEW", "WEIGHT_BELOW_CONFIGURED_THRESHOLD",
        "CURRENT_HEALTH_REQUIRES_REVIEW", "TEMPORARY_DEFERRAL_COUNTDOWN_ACTIVE",
    }
    if flags and deferral_flags.intersection(flags):
        outcome = "TEMPORARY_DEFERRAL_SUGGESTED"
    elif flags:
        outcome = "CLINICAL_REVIEW"
    else:
        outcome = "PROCEED_TO_CLINICAL"
    now = datetime.now(UTC)
    valid_until = now + timedelta(hours=72)
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    screening = Screening(
        donor_id=profile.id,
        questionnaire_version=payload.questionnaire_version,
        encrypted_answers=vault.encrypt_json(payload.model_dump(mode="json"), context=f"screening:{profile.id}"),
        outcome=outcome,
        flags=flags,
        attested_at=now,
        valid_until=valid_until,
        eligible_on=eligible_on,
        deferral_reason_codes=deferral_reason_codes,
    )
    session.add(screening)
    await session.flush()
    session.add(ScreeningReviewAssignment(
        screening_id=screening.id,
        hospital_id=review_hospital.id,
        selected_by_donor_at=now,
        purpose_consent_at=now,
        status="ACTIVE",
    ))
    session.add(ConsentRecord(
        user_id=user.id,
        purpose_code="SELECTED_FACILITY_PRECHECK_REVIEW",
        granted=True,
        notice_version="DPDP-PLAIN-2026-01",
        captured_at=now,
        source="SCREENING",
        metadata_json={
            "screening_id": str(screening.id),
            "hospital_id": str(review_hospital.id),
        },
    ))
    await append_audit_event(
        session, actor_uid=actor.uid, action="SCREENING_SELF_ATTESTED",
        resource_type="screening", resource_id=screening.id,
        metadata={
            "outcome": outcome, "flag_count": len(flags),
            "review_hospital_id": str(review_hospital.id),
            "purpose_consent": "DONOR_SELECTED_CONFIDENTIAL_PRECHECK_REVIEW",
        },
    )
    await session.commit()
    message = {
        "PROCEED_TO_CLINICAL": "Pre-check complete. Eligibility must still be confirmed by qualified staff on site.",
        "CLINICAL_REVIEW": "Your answers need a confidential review by qualified staff before donation.",
        "TEMPORARY_DEFERRAL_SUGGESTED": "Please do not proceed until qualified staff reviews the highlighted eligibility factors.",
    }[outcome]
    return ScreeningResult(
        screening_id=screening.id, outcome=outcome, flags=flags, valid_until=valid_until,
        eligible_on=eligible_on, deferral_reason_codes=deferral_reason_codes, message=message,
    )
