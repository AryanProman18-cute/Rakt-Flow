from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

BLOOD_TYPES = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "BOMBAY")
COMPONENT_TYPES = ("PRBC", "SDP", "RDP", "FFP", "CRYOPRECIPITATE", "WHOLE_BLOOD")
PHENOTYPE_CODES = (
    "BOMBAY_OH",
    "PARA_BOMBAY",
    "RH_NULL",
    "D_VARIANT",
    "KELL_NEGATIVE",
    "DUFFY_NULL",
    "KIDD_NULL",
    "MNS_RARE",
    "VEL_NEGATIVE",
    "OTHER_CONFIRMED",
)


class HospitalApplication(BaseModel):
    facility_name: str = Field(min_length=3, max_length=180)
    registration_number: str = Field(min_length=3, max_length=100)
    institutional_email: EmailStr
    phone: str = Field(min_length=10, max_length=24)
    address: str = Field(min_length=8, max_length=1000)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class HospitalVerification(BaseModel):
    decision: Literal["VERIFIED", "REJECTED", "SUSPENDED"]
    note: str = Field(default="", max_length=1000)


class InventoryMutation(BaseModel):
    blood_type: Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "BOMBAY"]
    phenotype_code: str | None = Field(default=None, max_length=64)
    component_type: Literal["PRBC", "SDP", "RDP", "FFP", "CRYOPRECIPITATE", "WHOLE_BLOOD"]
    event_type: Literal["RECEIPT", "ISSUE", "ADJUSTMENT", "DISCARD"]
    adjustment_direction: Literal["INCREASE", "DECREASE"] | None = None
    units: int = Field(ge=1, le=1000)
    reference: str = Field(min_length=3, max_length=100)
    reason: str = Field(default="", max_length=1000)
    minimum_level: int | None = Field(default=None, ge=0, le=1000)

    @model_validator(mode="after")
    def validate_inventory_identity(self):
        if self.phenotype_code and self.phenotype_code not in PHENOTYPE_CODES:
            raise ValueError("Use a supported, confirmed phenotype code")
        if self.blood_type == "BOMBAY" and not self.phenotype_code:
            self.phenotype_code = "BOMBAY_OH"
        if self.event_type == "ADJUSTMENT" and not self.adjustment_direction:
            raise ValueError("Adjustment direction is required")
        return self


class DriveUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=150)
    venue_name: str | None = Field(default=None, min_length=2, max_length=150)
    address: str | None = Field(default=None, min_length=5, max_length=500)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    target_units: int | None = Field(default=None, ge=1, le=1000)


class DriveProposalCreate(BaseModel):
    host_email: EmailStr
    proposed_name: str = Field(min_length=3, max_length=150)
    venue_name: str = Field(min_length=2, max_length=150)
    address: str = Field(min_length=5, max_length=1000)
    starts_at: datetime
    ends_at: datetime
    target_units: int = Field(ge=1, le=1000)
    power_available: bool
    wifi_available: bool
    recovery_seats: int = Field(ge=1, le=500)
    parking_available: bool
    privacy_partitions: bool

    @model_validator(mode="after")
    def validate_window(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Proposal end time must be after start time")
        return self


class ProposalDecision(BaseModel):
    decision: Literal["APPROVED", "CHANGES_REQUESTED", "REJECTED"]
    note: str = Field(default="", max_length=1000)


class PushSubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=20, max_length=4000)
    expirationTime: int | None = None
    keys: dict[str, str]
