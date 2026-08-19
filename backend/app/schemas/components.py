from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ComponentPolicyItem(BaseModel):
    component_type: Literal["WHOLE_BLOOD", "PRBC", "RBC", "SDP", "RDP", "PLATELETS", "FFP", "CRYOPRECIPITATE"]
    shelf_life_hours: int = Field(ge=1, le=20000)
    minimum_temperature_c: float | None = Field(default=None, ge=-80, le=40)
    maximum_temperature_c: float | None = Field(default=None, ge=-80, le=40)
    policy_reference: str = Field(min_length=3, max_length=200)
    active: bool = True


class ComponentPolicyUpdate(BaseModel):
    policies: list[ComponentPolicyItem] = Field(min_length=1, max_length=20)
    authorized_confirmation: bool


class ComponentReceive(BaseModel):
    scanned_code: str = Field(min_length=6, max_length=100)
    received_at: datetime
    temperature_c: float = Field(ge=-80, le=40)
    event_reference: str = Field(min_length=3, max_length=100)


class PreparedComponent(BaseModel):
    component_reference: str = Field(min_length=6, max_length=64)
    isbt128_code: str | None = Field(default=None, min_length=8, max_length=64)
    component_type: Literal["PRBC", "RBC", "SDP", "RDP", "PLATELETS", "FFP", "CRYOPRECIPITATE"]
    volume_ml: int | None = Field(default=None, ge=1, le=2000)


class ComponentSplit(BaseModel):
    prepared_at: datetime
    components: list[PreparedComponent] = Field(min_length=1, max_length=8)
    sop_confirmation: bool


class ComponentStatusEvent(BaseModel):
    event_type: Literal["RESERVED", "RELEASED", "ISSUED", "TRANSFUSED", "DISCARDED", "QUARANTINED"]
    occurred_at: datetime
    event_reference: str = Field(min_length=3, max_length=100)
    temperature_c: float | None = Field(default=None, ge=-80, le=40)
    authorized_confirmation: bool
    note: str = Field(default="", max_length=500)


class HandoverCreate(BaseModel):
    component_id: UUID
    to_hospital_id: UUID
    handed_over_at: datetime
    dispatch_temperature_c: float = Field(ge=-80, le=40)
    container_reference: str = Field(min_length=3, max_length=100)
    notes: str = Field(default="", max_length=1000)


class HandoverReceive(BaseModel):
    received_at: datetime
    receipt_temperature_c: float = Field(ge=-80, le=40)
    receipt_confirmation: bool
    notes: str = Field(default="", max_length=1000)
