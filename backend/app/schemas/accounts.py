from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

ROLE_VALUES = {
    "ROLE_DONOR",
    "ROLE_ORGANIZER",
    "ROLE_HOSPITAL",
    "ROLE_HOST_VENUE",
    "ROLE_SUPER_ADMIN",
}


class BootstrapResponse(BaseModel):
    user_id: UUID
    email: EmailStr
    roles: list[str]
    needs_profile: bool
    token_refresh_required: bool = True


class InvitationCreate(BaseModel):
    email: EmailStr
    roles: list[str] = Field(min_length=1, max_length=5)

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, values: list[str]) -> list[str]:
        normalized = sorted(set(values))
        if not set(normalized).issubset(ROLE_VALUES):
            raise ValueError("Unknown role")
        return normalized


class RoleUpdate(BaseModel):
    roles: list[str] = Field(min_length=1, max_length=5)

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, values: list[str]) -> list[str]:
        normalized = sorted(set(values))
        if not set(normalized).issubset(ROLE_VALUES):
            raise ValueError("Unknown role")
        return normalized


class DonorProfileUpsert(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    date_of_birth: date
    phone: str = Field(min_length=10, max_length=24)
    city: str = Field(min_length=2, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    blood_type: Literal["UNKNOWN", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "BOMBAY"] = "UNKNOWN"
    consent_to_process: bool
    emergency_notifications: bool = False


class DonorProfileView(BaseModel):
    reference_code: str
    full_name: str
    date_of_birth: date | None
    age: int | None
    phone: str
    phone_masked: str
    city: str | None
    latitude: float | None = None
    longitude: float | None = None
    blood_type: str
    profile_status: str
    email_verified: bool = True
    identity_verified: bool
    latest_screening_outcome: str | None
    screening_review_status: str | None = None
    screening_valid_until: datetime | None = None


class ScreeningSubmission(BaseModel):
    questionnaire_version: Literal["IN-PRECHECK-2026-01"] = "IN-PRECHECK-2026-01"
    weight_kg: float = Field(ge=25, le=250)
    feeling_well_today: bool
    fever_infection_or_antibiotics: bool
    medication_requires_review: bool
    heart_lung_kidney_liver_or_bleeding_condition: bool
    surgery_transfusion_or_hospitalization_last_12_months: bool
    tattoo_or_piercing_last_12_months: bool
    malaria_risk_travel_or_residence: bool
    pregnancy_breastfeeding_or_recent_delivery: bool | None = None
    last_donation_date: date | None = None
    answers_are_truthful: bool
    consent_to_clinical_review: bool


class ScreeningResult(BaseModel):
    screening_id: UUID
    outcome: Literal["PROCEED_TO_CLINICAL", "CLINICAL_REVIEW", "TEMPORARY_DEFERRAL_SUGGESTED"]
    flags: list[str]
    valid_until: datetime
    review_status: Literal["PENDING", "APPROVED", "DECLINED"] = "PENDING"
    message: str


class ScanPassRequest(BaseModel):
    drive_id: UUID
    pass_token: str = Field(min_length=40, max_length=4096)
    idempotency_key: str = Field(min_length=16, max_length=64)


class ManualCheckInRequest(BaseModel):
    drive_id: UUID
    donor_reference: str = Field(min_length=6, max_length=32)
    idempotency_key: str = Field(min_length=16, max_length=64)


class IntakeDonorView(BaseModel):
    checkin_id: UUID
    donor_reference: str
    display_name: str
    age: int | None
    blood_type: str
    latest_screening_outcome: str | None
    identity_verified: bool
    last_donation_date: date | None
    clearance_status: str
    checkin_method: Literal["QR", "MANUAL"]


class ClinicalAssessmentCreate(BaseModel):
    decision: Literal["CLEARED", "DEFERRED"]
    reason_codes: list[str] = Field(default_factory=list, max_length=20)
    hemoglobin_g_dl: float | None = Field(default=None, ge=2, le=25)
    systolic_bp: int | None = Field(default=None, ge=50, le=260)
    diastolic_bp: int | None = Field(default=None, ge=30, le=180)
    pulse_bpm: int | None = Field(default=None, ge=30, le=220)


class DriveCreate(BaseModel):
    name: str = Field(min_length=3, max_length=150)
    venue_name: str = Field(min_length=2, max_length=150)
    address: str = Field(min_length=5, max_length=500)
    starts_at: datetime
    ends_at: datetime
    target_units: int = Field(ge=1, le=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class DriveStatusUpdate(BaseModel):
    status: Literal["PLANNED", "APPROVED", "ACTIVE", "COMPLETED", "CANCELLED"]


class DonationRecordCreate(BaseModel):
    component_type: Literal["WHOLE_BLOOD", "PRBC", "SDP", "FFP"]
    volume_ml: int | None = Field(default=None, ge=50, le=1000)
    blood_type_at_collection: Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "BOMBAY"]
    unit_reference: str = Field(min_length=6, max_length=40)
    collected_at: datetime
