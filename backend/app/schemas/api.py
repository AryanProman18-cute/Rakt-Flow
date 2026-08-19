from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "raktflow-api"
    version: str = "0.1.0"


class DonorPassResponse(BaseModel):
    token: str
    rotating_code: str
    expires_at: datetime
    offline_valid_until: datetime


class CheckInCreate(BaseModel):
    idempotency_key: str = Field(min_length=16, max_length=64)
    drive_id: UUID
    donor_id: UUID
    scanned_at: datetime
    clearance_status: Literal["PENDING_REVIEW"] = "PENDING_REVIEW"


class CheckInBatch(BaseModel):
    items: list[CheckInCreate] = Field(min_length=1, max_length=250)


class BatchResult(BaseModel):
    accepted: int
    duplicates: int


class RequestCreate(BaseModel):
    patient_reference: str = Field(min_length=3, max_length=128)
    blood_type: str = Field(pattern=r"^(A|B|AB|O)[+-]$|^BOMBAY$")
    phenotype_code: Literal[
        "BOMBAY_OH", "PARA_BOMBAY", "RH_NULL", "D_VARIANT", "KELL_NEGATIVE",
        "DUFFY_NULL", "KIDD_NULL", "MNS_RARE", "VEL_NEGATIVE", "OTHER_CONFIRMED",
    ] | None = None
    component_type: Literal["PRBC", "SDP", "RDP", "FFP", "CRYOPRECIPITATE", "WHOLE_BLOOD"]
    units_needed: int = Field(ge=1, le=20)
    urgency: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL_PPH", "RARE_STANDBY"]
    expires_in_hours: int = Field(default=8, ge=6, le=12)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    document_object_key: str = Field(min_length=8, max_length=512)
    document_sha256_hex: str = Field(pattern=r"^[a-fA-F0-9]{64}$")

    @field_validator("blood_type")
    @classmethod
    def uppercase_blood_type(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def identify_rare_requirement(self):
        if self.blood_type == "BOMBAY" and not self.phenotype_code:
            self.phenotype_code = "BOMBAY_OH"
        return self


class VerificationDecision(BaseModel):
    decision: Literal["VERIFIED", "REJECTED"]
    reason_code: str = Field(min_length=3, max_length=80)
    physician_registration_confirmed: bool
    component_confirmed: bool
    document_review_confirmed: bool = False
    ocr_mismatch_resolved: bool = False
    review_note: str = Field(default="", max_length=1000)


class ResolveRequest(BaseModel):
    receiving_event_id: str = Field(min_length=8, max_length=100)
    units_received: int = Field(ge=1, le=20)


class RareDispatchCreate(BaseModel):
    request_id: UUID
    initial_radius_km: Literal[15] = 15
    cohort_size: int = Field(default=5, ge=3, le=5)


class DispatchResult(BaseModel):
    request_id: UUID
    tier: int
    radius_km: int
    donors_contacted: int
    response_deadline: datetime


class PPHDispatchCreate(BaseModel):
    request_id: UUID
    ward: str = Field(min_length=2, max_length=80)
    clinical_owner_registration: str = Field(min_length=3, max_length=80)
    authorization_confirmed: bool


class PlateletDonorCandidate(BaseModel):
    donor_id: UUID
    last_apheresis_at: datetime | None = None
    platelet_count: int | None = Field(default=None, ge=0, le=1_000_000)
    vein_access_suitable: bool
    available_days: list[int] = Field(default_factory=list)


class PlateletScheduleRequest(BaseModel):
    starts_at: datetime
    donors: list[PlateletDonorCandidate] = Field(max_length=500)
