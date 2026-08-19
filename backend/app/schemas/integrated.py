from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


class PosterDesign(BaseModel):
    headline: str = Field(default="Donate blood. Give time.", min_length=3, max_length=120)
    subheading: str = Field(default="Join a verified community blood drive.", max_length=240)
    call_to_action: str = Field(default="Register securely", min_length=2, max_length=60)
    organizer_name: str = Field(default="RaktFlow community partner", min_length=2, max_length=100)
    accent_color: str = Field(default="#e11d48", pattern=r"^#[0-9a-fA-F]{6}$")


class CampaignCreate(BaseModel):
    drive_id: UUID
    slug: str = Field(min_length=3, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(min_length=3, max_length=150)
    description: str = Field(default="", max_length=1000)
    poster: PosterDesign = Field(default_factory=PosterDesign)

    @field_validator("slug")
    @classmethod
    def normalize_slug(cls, value: str) -> str:
        return value.strip().lower()


class CampaignUpdate(BaseModel):
    slug: str | None = Field(default=None, min_length=3, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str | None = Field(default=None, min_length=3, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    poster: PosterDesign | None = None
    status: Literal["DRAFT", "PUBLISHED", "ARCHIVED"] | None = None

    @field_validator("slug")
    @classmethod
    def normalize_slug(cls, value: str | None) -> str | None:
        return value.strip().lower() if value else value


class CampaignVisitCreate(BaseModel):
    visitor_key: str = Field(min_length=16, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")


class DriveRegistrationCreate(BaseModel):
    campaign_id: UUID | None = None


class CampaignShare(BaseModel):
    recipient_email: EmailStr
    personal_message: str = Field(default="", max_length=500)


class DriveQuotaItem(BaseModel):
    blood_type: str = Field(pattern=r"^(A|B|AB|O)[+-]$|^BOMBAY$")
    max_registrations: int = Field(ge=0, le=1000)
    source_request_id: UUID | None = None
    rationale: str = Field(default="", max_length=240)
    active: bool = True


class DriveQuotaUpdate(BaseModel):
    quotas: list[DriveQuotaItem] = Field(min_length=1, max_length=9)


class ScreeningReview(BaseModel):
    decision: Literal["APPROVED", "DECLINED"]
    note: str = Field(default="", max_length=1000)
