import enum
from datetime import date, datetime
from uuid import UUID

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamped, UUIDPrimaryKey


class UserRole(enum.StrEnum):
    DONOR = "ROLE_DONOR"
    HOSPITAL = "ROLE_HOSPITAL"
    ORGANIZER = "ROLE_ORGANIZER"
    HOST_VENUE = "ROLE_HOST_VENUE"


class RequestUrgency(enum.StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL_PPH = "CRITICAL_PPH"
    RARE_STANDBY = "RARE_STANDBY"


class RequestStatus(enum.StrEnum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    RESOLVED = "RESOLVED"
    EXPIRED = "EXPIRED"


class User(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "users"
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=lambda members: [item.value for item in members]),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class UserRoleGrant(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "user_role_grants"
    __table_args__ = (UniqueConstraint("user_id", "role", name="uq_user_role_grant"),)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    granted_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Invitation(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "invitations"
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    roles: Mapped[list[str]] = mapped_column(JSONB, default=list)
    invited_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivery_status: Mapped[str] = mapped_column(String(40), default="NOT_SENT", nullable=False)
    delivery_provider_id: Mapped[str | None] = mapped_column(String(160))
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DonorProfile(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "donor_profiles"
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    reference_code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    phone_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True)
    phone_encrypted: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100))
    blood_type: Mapped[str] = mapped_column(String(12), default="UNKNOWN")
    phenotype_codes: Mapped[list[str]] = mapped_column(JSONB, default=list)
    profile_status: Mapped[str] = mapped_column(String(24), default="INCOMPLETE")
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    identity_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    identity_verified_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    last_donation_date: Mapped[date | None] = mapped_column(Date)
    is_apheresis_eligible: Mapped[bool] = mapped_column(Boolean, default=False)
    is_on_call_standby: Mapped[bool] = mapped_column(Boolean, default=False)
    eligibility_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    location: Mapped[object | None] = mapped_column(Geography("POINT", srid=4326))


class HospitalProfile(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "hospital_profiles"
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    facility_name: Mapped[str] = mapped_column(String(180), nullable=False)
    registration_number: Mapped[str] = mapped_column(String(100), nullable=False)
    institutional_email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_encrypted: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[object | None] = mapped_column(Geography("POINT", srid=4326))
    status: Mapped[str] = mapped_column(String(24), default="PENDING")
    verified_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)


class HospitalApplicationDocument(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "hospital_application_documents"
    hospital_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="CASCADE"))
    uploader_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    document_kind: Mapped[str] = mapped_column(String(40), default="REGISTRATION_EVIDENCE")
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    encrypted_content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sha256: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)


class Venue(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "venues"
    owner_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    facility_name: Mapped[str] = mapped_column(String(150))
    address: Mapped[str] = mapped_column(Text)
    capacity: Mapped[int] = mapped_column(Integer)
    location: Mapped[object] = mapped_column(Geography("POINT", srid=4326))


class Drive(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "drives"
    organizer_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    venue_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("venues.id"))
    venue_name: Mapped[str | None] = mapped_column(String(150))
    address: Mapped[str | None] = mapped_column(Text)
    location: Mapped[object | None] = mapped_column(Geography("POINT", srid=4326))
    name: Mapped[str] = mapped_column(String(150))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    target_units: Mapped[int] = mapped_column(Integer, default=50)
    status: Mapped[str] = mapped_column(String(24), default="PLANNED")


class DriveProposal(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "drive_proposals"
    organizer_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    host_email: Mapped[str] = mapped_column(String(255), nullable=False)
    proposed_name: Mapped[str] = mapped_column(String(150), nullable=False)
    venue_name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    target_units: Mapped[int] = mapped_column(Integer, nullable=False)
    requirements_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="PENDING")
    responded_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    response_note: Mapped[str | None] = mapped_column(Text)
    resulting_drive_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("drives.id"))


class Campaign(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "campaigns"
    drive_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("drives.id", ondelete="CASCADE"))
    organizer_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    poster_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CampaignVisit(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "campaign_visits"
    __table_args__ = (UniqueConstraint("campaign_id", "visitor_hash", name="uq_campaign_visitor"),)
    campaign_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"))
    visitor_hash: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    first_visited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_visited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    visit_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class DriveRegistration(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "drive_registrations"
    __table_args__ = (UniqueConstraint("drive_id", "donor_id", name="uq_drive_registration"),)
    drive_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("drives.id", ondelete="CASCADE"))
    donor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("donor_profiles.id", ondelete="CASCADE"))
    source_campaign_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), default="REGISTERED", nullable=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DriveBloodQuota(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "drive_blood_quotas"
    __table_args__ = (UniqueConstraint("drive_id", "blood_type", name="uq_drive_blood_quota"),)
    drive_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("drives.id", ondelete="CASCADE"))
    blood_type: Mapped[str] = mapped_column(String(12), nullable=False)
    max_registrations: Mapped[int] = mapped_column(Integer, nullable=False)
    source_request_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_requests.id", ondelete="SET NULL"))
    rationale: Mapped[str | None] = mapped_column(String(240))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class BloodInventory(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "blood_inventory"
    __table_args__ = (UniqueConstraint("hospital_id", "blood_type", "component_type", "phenotype_code", name="uq_inventory_group_component_phenotype"),)
    hospital_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="CASCADE"))
    blood_type: Mapped[str] = mapped_column(String(12), nullable=False)
    phenotype_code: Mapped[str] = mapped_column(String(64), default="STANDARD", nullable=False)
    component_type: Mapped[str] = mapped_column(String(20), nullable=False)
    units_available: Mapped[int] = mapped_column(Integer, default=0)
    units_reserved: Mapped[int] = mapped_column(Integer, default=0)
    minimum_level: Mapped[int] = mapped_column(Integer, default=2)


class InventoryEvent(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "inventory_events"
    inventory_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_inventory.id", ondelete="CASCADE"))
    hospital_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id"))
    actor_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    event_type: Mapped[str] = mapped_column(String(24), nullable=False)
    delta_units: Mapped[int] = mapped_column(Integer, nullable=False)
    resulting_units: Mapped[int] = mapped_column(Integer, nullable=False)
    reference: Mapped[str] = mapped_column(String(100), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PushSubscription(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "push_subscriptions"
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    endpoint_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    encrypted_subscription: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(300))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_count: Mapped[int] = mapped_column(Integer, default=0)


class Screening(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "screenings"
    donor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("donor_profiles.id", ondelete="CASCADE"))
    questionnaire_version: Mapped[str] = mapped_column(String(32), default="IN-PRECHECK-2026-01")
    encrypted_answers: Mapped[bytes] = mapped_column(LargeBinary)
    outcome: Mapped[str] = mapped_column(String(32))
    flags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    attested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    review_status: Mapped[str] = mapped_column(String(24), default="PENDING", nullable=False)
    reviewed_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)
    eligible_on: Mapped[date | None] = mapped_column(Date)
    deferral_reason_codes: Mapped[list[str]] = mapped_column(JSONB, default=list)


class ScreeningReviewAssignment(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "screening_review_assignments"
    __table_args__ = (UniqueConstraint("screening_id", name="uq_screening_review_assignment"),)
    screening_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("screenings.id", ondelete="CASCADE"), nullable=False)
    hospital_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="RESTRICT"), nullable=False)
    selected_by_donor_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    purpose_consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)


class CheckIn(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "checkins"
    __table_args__ = (UniqueConstraint("idempotency_key"),)
    drive_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("drives.id"))
    donor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("donor_profiles.id"))
    scanner_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    clearance_status: Mapped[str] = mapped_column(String(24))
    checkin_method: Mapped[str] = mapped_column(String(16), default="QR")
    source: Mapped[str] = mapped_column(String(20), default="ONLINE")


class ClinicalAssessment(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "clinical_assessments"
    checkin_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("checkins.id", ondelete="CASCADE"), unique=True)
    assessor_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(24))
    reason_codes: Mapped[list[str]] = mapped_column(JSONB, default=list)
    encrypted_measurements: Mapped[bytes | None] = mapped_column(LargeBinary)
    assessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DonationRecord(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "donation_records"
    checkin_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("checkins.id"), unique=True)
    donor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("donor_profiles.id"))
    drive_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("drives.id"))
    recorded_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    blood_type_at_collection: Mapped[str] = mapped_column(String(12))
    component_type: Mapped[str] = mapped_column(String(20))
    volume_ml: Mapped[int | None] = mapped_column(Integer)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    unit_reference: Mapped[str] = mapped_column(String(40), unique=True)


class BloodUnit(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "blood_units"
    donation_record_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("donation_records.id", ondelete="RESTRICT"), unique=True)
    donor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("donor_profiles.id", ondelete="RESTRICT"))
    drive_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("drives.id", ondelete="RESTRICT"))
    unit_reference: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    blood_type: Mapped[str] = mapped_column(String(12), nullable=False)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="COLLECTED", nullable=False)


class BloodComponent(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "blood_components"
    blood_unit_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_units.id", ondelete="RESTRICT"))
    parent_component_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_components.id", ondelete="RESTRICT"))
    component_reference: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    isbt128_code: Mapped[str | None] = mapped_column(String(64), unique=True)
    component_type: Mapped[str] = mapped_column(String(24), nullable=False)
    blood_type: Mapped[str] = mapped_column(String(12), nullable=False)
    volume_ml: Mapped[int | None] = mapped_column(Integer)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    prepared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    current_hospital_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(24), default="COLLECTED", nullable=False)


class ComponentShelfLifePolicy(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "component_shelf_life_policies"
    __table_args__ = (UniqueConstraint("hospital_id", "component_type", name="uq_component_policy_facility_type"),)
    hospital_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False)
    component_type: Mapped[str] = mapped_column(String(32), nullable=False)
    shelf_life_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    minimum_temperature_c: Mapped[float | None] = mapped_column(Numeric(5, 2))
    maximum_temperature_c: Mapped[float | None] = mapped_column(Numeric(5, 2))
    policy_reference: Mapped[str] = mapped_column(String(200), nullable=False)
    verified_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ComponentEvent(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "component_events"
    component_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_components.id", ondelete="RESTRICT"))
    actor_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    hospital_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    temperature_c: Mapped[float | None] = mapped_column(Numeric(5, 2))
    event_reference: Mapped[str | None] = mapped_column(String(100))
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class ColdChainHandover(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "cold_chain_handovers"
    component_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_components.id", ondelete="RESTRICT"))
    from_hospital_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="SET NULL"))
    to_hospital_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="SET NULL"))
    handed_over_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    received_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    handed_over_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dispatch_temperature_c: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    receipt_temperature_c: Mapped[float | None] = mapped_column(Numeric(5, 2))
    container_reference: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="IN_TRANSIT", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class DonorUnitNotification(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "donor_unit_notifications"
    __table_args__ = (UniqueConstraint("donor_id", "component_id", "event_type", name="uq_donor_unit_event"),)
    donor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("donor_profiles.id", ondelete="CASCADE"))
    blood_unit_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_units.id", ondelete="CASCADE"))
    component_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_components.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    safe_message: Mapped[str] = mapped_column(String(500), nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(32), default="IN_APP", nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RequisitionDocument(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "requisition_documents"
    hospital_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    object_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    encrypted_content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sha256: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    ocr_status: Mapped[str] = mapped_column(String(32), default="NOT_PROCESSED", nullable=False)
    ocr_text_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    ocr_fields: Mapped[dict] = mapped_column(JSONB, default=dict)
    ocr_processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ocr_error_code: Mapped[str | None] = mapped_column(String(80))


class BloodRequest(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "blood_requests"
    hospital_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    patient_reference_hash: Mapped[bytes] = mapped_column(LargeBinary(32))
    blood_type: Mapped[str] = mapped_column(String(12))
    phenotype_code: Mapped[str | None] = mapped_column(String(64))
    component_type: Mapped[str] = mapped_column(String(20))
    units_needed: Mapped[int] = mapped_column(Integer)
    urgency: Mapped[RequestUrgency] = mapped_column(Enum(RequestUrgency, name="urgency_level"))
    document_object_key: Mapped[str] = mapped_column(Text)
    document_sha256: Mapped[bytes] = mapped_column(LargeBinary(32))
    status: Mapped[RequestStatus] = mapped_column(Enum(RequestStatus, name="verification_status"), default=RequestStatus.PENDING)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    location: Mapped[object] = mapped_column(Geography("POINT", srid=4326))
    verified_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ocr_status: Mapped[str] = mapped_column(String(32), default="NOT_PROCESSED", nullable=False)
    ocr_fields: Mapped[dict] = mapped_column(JSONB, default=dict)
    document_date: Mapped[date | None] = mapped_column(Date)
    document_review_note: Mapped[str | None] = mapped_column(Text)


class DonorAlert(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "donor_alerts"
    request_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_requests.id", ondelete="CASCADE"))
    donor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("donor_profiles.id"))
    tier: Mapped[int] = mapped_column(Integer)
    radius_km: Mapped[int] = mapped_column(Integer)
    response: Mapped[str] = mapped_column(String(20), default="PENDING")
    response_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Dispatch(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "dispatches"
    request_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("blood_requests.id"))
    kind: Mapped[str] = mapped_column(String(24))
    clinical_owner_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    courier_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(24), default="ACTIVATED")
    target_arrival_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_location: Mapped[object | None] = mapped_column(Geography("POINT", srid=4326))


class PlateletWindow(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "platelet_windows"
    donor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("donor_profiles.id"))
    group_code: Mapped[str] = mapped_column(String(8))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="OFFERED")


class ConsentRecord(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "consent_records"
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    purpose_code: Mapped[str] = mapped_column(String(60), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    notice_version: Mapped[str] = mapped_column(String(32), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


class DataRightsRequest(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "data_rights_requests"
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    request_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="SUBMITTED", nullable=False)
    details_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)


class UserPreference(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "user_preferences"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_preferences_user"),)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    appearance: Mapped[str] = mapped_column(String(16), default="SYSTEM", nullable=False)
    language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    in_app_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sms_notifications: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rare_blood_opt_in: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    location_matching_opt_in: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    donation_lifecycle_opt_in: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class NotificationOutbox(Base, UUIDPrimaryKey, Timestamped):
    __tablename__ = "notification_outbox"
    topic: Mapped[str] = mapped_column(String(100), nullable=False)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class AuditEvent(Base, UUIDPrimaryKey):
    __tablename__ = "audit_events"
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actor_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False)
    resource_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    previous_hash: Mapped[bytes | None] = mapped_column(LargeBinary(32))
    event_hash: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
