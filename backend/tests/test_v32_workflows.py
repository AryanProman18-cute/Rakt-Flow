import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.security import Actor, require_roles
from app.schemas.integrated import (
    CampaignCreate,
    CampaignVisitCreate,
    DriveRegistrationCreate,
    PosterDesign,
    ScreeningReview,
)
from app.schemas.operations import DriveProposalCreate
from app.services.clinical_safety import current_screening_is_approved


def test_campaign_slug_poster_and_attribution_are_validated():
    drive_id = uuid4()
    campaign = CampaignCreate(
        drive_id=drive_id,
        slug="community-drive-august",
        title="Community donation drive",
        poster=PosterDesign(accent_color="#e11d48"),
    )
    assert campaign.slug == "community-drive-august"
    assert DriveRegistrationCreate(campaign_id=campaign.drive_id).campaign_id == drive_id
    assert CampaignVisitCreate(visitor_key="browser_random_1234").visitor_key

    with pytest.raises(ValidationError):
        CampaignCreate(drive_id=drive_id, slug="Unsafe Link", title="Campaign")
    with pytest.raises(ValidationError):
        PosterDesign(accent_color="red")
    with pytest.raises(ValidationError):
        CampaignVisitCreate(visitor_key="short")


def test_clinical_review_accepts_only_audited_qr_decisions():
    assert ScreeningReview(decision="APPROVED", note="Current pre-check reviewed").decision == "APPROVED"
    assert ScreeningReview(decision="DECLINED").decision == "DECLINED"
    with pytest.raises(ValidationError):
        ScreeningReview(decision="CLEARED")


def test_latest_screening_must_be_current_approved_and_match_qr_token():
    now = datetime.now(UTC)
    approved_id = uuid4()
    approved = SimpleNamespace(
        id=approved_id,
        review_status="APPROVED",
        valid_until=now + timedelta(hours=1),
    )
    pending_newer = SimpleNamespace(
        id=uuid4(),
        review_status="PENDING",
        valid_until=now + timedelta(hours=2),
    )
    expired = SimpleNamespace(
        id=uuid4(),
        review_status="APPROVED",
        valid_until=now - timedelta(seconds=1),
    )

    assert current_screening_is_approved(approved, expected_id=approved_id, now=now)
    assert not current_screening_is_approved(approved, expected_id=uuid4(), now=now)
    assert not current_screening_is_approved(pending_newer, now=now)
    assert not current_screening_is_approved(expired, now=now)
    assert not current_screening_is_approved(None, now=now)


def test_staff_routes_reject_uninvited_donor_but_super_admin_is_global():
    dependency = require_roles("ROLE_ORGANIZER")
    donor = Actor(
        uid="donor-1", email="donor@example.test",
        roles=frozenset({"ROLE_DONOR"}), email_verified=True,
    )
    admin = Actor(
        uid="admin-1", email="admin@example.test",
        roles=frozenset({"ROLE_SUPER_ADMIN"}), email_verified=True,
    )
    with pytest.raises(HTTPException) as rejected:
        asyncio.run(dependency(donor))
    assert rejected.value.status_code == 403
    assert asyncio.run(dependency(admin)) is admin


def test_host_proposal_requires_a_real_location_pair():
    base = {
        "host_email": "host@example.com",
        "proposed_name": "Community drive",
        "venue_name": "Community hall",
        "address": "Main Road, Visakhapatnam",
        "starts_at": datetime.now(UTC) + timedelta(days=3),
        "ends_at": datetime.now(UTC) + timedelta(days=3, hours=5),
        "target_units": 50,
        "power_available": True,
        "wifi_available": True,
        "recovery_seats": 20,
        "parking_available": True,
        "privacy_partitions": True,
    }
    proposal = DriveProposalCreate(**base, latitude=17.6868, longitude=83.2185)
    assert proposal.latitude == 17.6868
    with pytest.raises(ValidationError):
        DriveProposalCreate(**base, latitude=17.6868)
