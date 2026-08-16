from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.api import CheckInCreate, RequestCreate
from app.schemas.operations import DriveProposalCreate, InventoryMutation


def request_payload(**overrides):
    payload = {
        "patient_reference": "MRN-1001",
        "blood_type": "O-",
        "component_type": "PRBC",
        "units_needed": 2,
        "urgency": "HIGH",
        "expires_in_hours": 8,
        "document_object_key": "req-document-key",
        "document_sha256_hex": "a" * 64,
    }
    payload.update(overrides)
    return payload


def test_bombay_request_is_explicitly_identified() -> None:
    request = RequestCreate(**request_payload(blood_type="BOMBAY"))
    assert request.phenotype_code == "BOMBAY_OH"


def test_arbitrary_rare_phenotype_is_rejected() -> None:
    with pytest.raises(ValidationError):
        RequestCreate(**request_payload(phenotype_code="FREE_TEXT_RARE"))


def test_inventory_requires_direction_for_adjustment() -> None:
    with pytest.raises(ValidationError):
        InventoryMutation(
            blood_type="O+",
            component_type="PRBC",
            event_type="ADJUSTMENT",
            units=1,
            reference="COUNT-100",
        )


def test_bombay_inventory_gets_confirmed_identity() -> None:
    mutation = InventoryMutation(
        blood_type="BOMBAY",
        component_type="PRBC",
        event_type="RECEIPT",
        units=1,
        reference="GRN-100",
    )
    assert mutation.phenotype_code == "BOMBAY_OH"


def test_drive_proposal_rejects_reverse_window() -> None:
    now = datetime.now(UTC)
    with pytest.raises(ValidationError):
        DriveProposalCreate(
            host_email="host@example.org",
            proposed_name="Community drive",
            venue_name="Auditorium",
            address="Main Road, Visakhapatnam",
            starts_at=now,
            ends_at=now - timedelta(hours=1),
            target_units=50,
            power_available=True,
            wifi_available=True,
            recovery_seats=30,
            parking_available=True,
            privacy_partitions=True,
        )


def test_organizer_checkin_cannot_assert_clearance() -> None:
    with pytest.raises(ValidationError):
        CheckInCreate(
            idempotency_key="1234567890abcdef",
            drive_id="00000000-0000-0000-0000-000000000001",
            donor_id="00000000-0000-0000-0000-000000000002",
            scanned_at=datetime.now(UTC),
            clearance_status="CLEARED",
        )
