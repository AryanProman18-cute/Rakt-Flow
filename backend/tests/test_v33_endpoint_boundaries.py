import base64
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, current_actor
from app.main import app
from app.models.entities import BloodUnit, DonationRecord


class ScalarRows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class ExecuteRows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class QueueSession:
    def __init__(self, *, scalars=None, scalar_values=None, execute_rows=None, get_values=None):
        self.scalars_rows = list(scalars or [])
        self.scalar_values = list(scalar_values or [])
        self.execute_rows = list(execute_rows or [])
        self.get_values = get_values or {}
        self.added = []
        self.statements = []
        self.committed = False

    async def scalars(self, statement):
        self.statements.append(str(statement))
        return ScalarRows(self.scalars_rows.pop(0) if self.scalars_rows else [])

    async def scalar(self, statement):
        self.statements.append(str(statement))
        return self.scalar_values.pop(0) if self.scalar_values else None

    async def execute(self, statement):
        self.statements.append(str(statement))
        return ExecuteRows(self.execute_rows.pop(0) if self.execute_rows else [])

    async def get(self, model, identity):
        return self.get_values.get(model)

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        return None

    async def commit(self):
        self.committed = True


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()


def actor_override(*roles, email="actor@example.org"):
    async def dependency():
        return Actor(
            uid="firebase-actor",
            email=email,
            roles=frozenset(roles),
            email_verified=True,
        )

    return dependency


def session_override(session):
    async def dependency():
        yield session

    return dependency


def user_override(user_id=None):
    async def dependency():
        return SimpleNamespace(id=user_id or uuid4())

    return dependency


@pytest.mark.parametrize(
    ("path", "role"),
    [
        ("/api/v1/clinical/screenings", "ROLE_DONOR"),
        ("/api/v1/drives/proposals/host-impact", "ROLE_ORGANIZER"),
        ("/api/v1/privacy/admin/requests", "ROLE_HOSPITAL"),
        ("/api/v1/components/mine", "ROLE_ORGANIZER"),
    ],
)
def test_sensitive_endpoints_reject_wrong_role_before_data_access(client, path, role):
    app.dependency_overrides[current_actor] = actor_override(role)
    app.dependency_overrides[database_user] = user_override()
    app.dependency_overrides[get_session] = session_override(QueueSession())

    response = client.get(path)

    assert response.status_code == 403
    assert response.json()["detail"] == "Role is not authorized for this action"


def test_clinical_queue_is_assignment_scoped_and_minimum_necessary(client):
    facility_id = uuid4()
    session = QueueSession(
        scalar_values=[SimpleNamespace(id=facility_id, status="VERIFIED")],
        execute_rows=[[
            (
                SimpleNamespace(
                    id=uuid4(), outcome="CLINICAL_REVIEW", flags=["MEDICATION_REVIEW"],
                    attested_at=datetime.now(UTC), valid_until=datetime.now(UTC) + timedelta(days=1),
                    review_status="PENDING", reviewed_at=None, review_note=None,
                    eligible_on=None, deferral_reason_codes=[], created_at=datetime.now(UTC),
                    encrypted_answers=None,
                ),
                SimpleNamespace(
                    id=uuid4(), reference_code="RF-PRIVATE1", date_of_birth=date(1995, 1, 1),
                    blood_type="O-", city="Visakhapatnam", display_name="Must not leak",
                    phone_encrypted=b"must-not-leak",
                ),
            )
        ]],
    )
    app.dependency_overrides[current_actor] = actor_override("ROLE_HOSPITAL")
    app.dependency_overrides[database_user] = user_override()
    app.dependency_overrides[get_session] = session_override(session)

    response = client.get("/api/v1/clinical/screenings")

    assert response.status_code == 200
    item = response.json()[0]
    assert item["donor_reference"] == "RF-PRIVATE1"
    for forbidden in ("display_name", "phone", "date_of_birth", "questionnaire", "answers", "location"):
        assert forbidden not in item
    queue_statement = next(text for text in session.statements if "screening_review_assignments" in text)
    assert "screening_review_assignments.hospital_id" in queue_statement
    assert "screening_review_assignments.status" in queue_statement


def test_host_impact_returns_only_aggregate_proposal_linked_results(client):
    proposal_id, drive_id = uuid4(), uuid4()
    proposal = SimpleNamespace(
        id=proposal_id, resulting_drive_id=drive_id, proposed_name="Community Drive",
        venue_name="Host Hall", starts_at=datetime(2026, 9, 1, tzinfo=UTC),
    )
    session = QueueSession(scalars=[[proposal]], scalar_values=[12, 9, 7])
    app.dependency_overrides[current_actor] = actor_override(
        "ROLE_HOST_VENUE", email="host@example.org"
    )
    app.dependency_overrides[get_session] = session_override(session)

    response = client.get("/api/v1/drives/proposals/host-impact")

    assert response.status_code == 200
    item = response.json()[0]
    assert item == {
        "proposal_id": str(proposal_id), "drive_id": str(drive_id),
        "drive_name": "Community Drive", "venue_name": "Host Hall",
        "starts_at": "2026-09-01T00:00:00Z", "registrations": 12,
        "checkins": 9, "units_logged": 7,
        "privacy_notice": "Aggregate host impact only; no donor identity or health data is included.",
    }
    proposal_statement = session.statements[0]
    assert "lower(drive_proposals.host_email)" in proposal_statement
    assert "drive_proposals.resulting_drive_id IS NOT NULL" in proposal_statement


def test_profile_endpoint_persists_and_returns_only_grid_coordinates(client):
    user_id = uuid4()
    # User lookup, existing profile, registration consent, location consent,
    # preference and previous audit event.
    session = QueueSession(
        scalar_values=[SimpleNamespace(id=user_id), None, None, None, None, None]
    )
    key = base64.urlsafe_b64encode(b"k" * 32).decode()
    settings = Settings(
        _env_file=None,
        app_env="development",
        pii_encryption_key=key,
        phone_hash_pepper="p" * 32,
        token_signing_secret="t" * 40,
    )
    app.dependency_overrides[current_actor] = actor_override("ROLE_DONOR")
    app.dependency_overrides[get_session] = session_override(session)
    app.dependency_overrides[get_settings] = lambda: settings

    response = client.put(
        "/api/v1/donors/me/profile",
        json={
            "full_name": "Adult Donor", "date_of_birth": "1990-01-01",
            "phone": "9908840322", "city": "Rasapudipalem", "blood_type": "O+",
            "latitude": 17.12345, "longitude": 82.98765, "consent_to_process": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["latitude"] == pytest.approx(17.12)
    assert body["longitude"] == pytest.approx(82.98)
    assert body["latitude"] != 17.12345 and body["longitude"] != 82.98765
    assert session.committed is True


def test_component_already_at_same_facility_is_not_received_twice(client):
    user_id, hospital_id, unit_id = uuid4(), uuid4(), uuid4()
    session = QueueSession(
        scalar_values=[
            SimpleNamespace(id=hospital_id, status="VERIFIED"),
            SimpleNamespace(
                id=uuid4(), blood_unit_id=unit_id, current_hospital_id=hospital_id,
            ),
        ],
        get_values={
            BloodUnit: SimpleNamespace(id=unit_id, donation_record_id=uuid4()),
            DonationRecord: SimpleNamespace(recorded_by_user_id=uuid4()),
        },
    )
    app.dependency_overrides[current_actor] = actor_override("ROLE_HOSPITAL")
    app.dependency_overrides[database_user] = user_override(user_id)
    app.dependency_overrides[get_session] = session_override(session)

    response = client.post(
        "/api/v1/components/receive",
        json={
            "scanned_code": "RF-COMP-001", "received_at": "2026-08-19T12:00:00Z",
            "temperature_c": 4.0, "event_reference": "RECEIPT-001",
        },
    )

    assert response.status_code == 409
    assert "already held" in response.json()["detail"]
    assert session.committed is False


def test_dispatcher_cannot_confirm_their_own_destination_receipt(client):
    user_id, hospital_id, handover_id = uuid4(), uuid4(), uuid4()
    session = QueueSession(
        scalar_values=[
            SimpleNamespace(id=hospital_id, status="VERIFIED"),
            SimpleNamespace(
                id=handover_id, to_hospital_id=hospital_id, status="IN_TRANSIT",
                handed_over_by_user_id=user_id,
            ),
        ]
    )
    app.dependency_overrides[current_actor] = actor_override("ROLE_HOSPITAL")
    app.dependency_overrides[database_user] = user_override(user_id)
    app.dependency_overrides[get_session] = session_override(session)

    response = client.post(
        f"/api/v1/components/handovers/{handover_id}/receive",
        json={
            "received_at": "2026-08-19T13:00:00Z", "receipt_temperature_c": 4.0,
            "receipt_confirmation": True, "notes": "Container intact",
        },
    )

    assert response.status_code == 409
    assert "dispatching staff member" in response.json()["detail"]
    assert session.committed is False


def test_configured_cors_allows_known_origin_and_rejects_unknown_origin(client):
    known_origin = "http://localhost:5173"
    allowed = client.options(
        "/api/v1/health",
        headers={
            "Origin": known_origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    rejected = client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://unlisted.example.org",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == known_origin
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers


def test_auto_assign_review_facilities_uses_stored_location_or_falls_back():
    """Donor location is a Geography column — ranking must never touch non-existent lat/lng attrs."""
    import asyncio

    from app.api.routes.accounts import _auto_assign_review_facilities

    facility = SimpleNamespace(
        id=uuid4(), status="VERIFIED", state="Andhra Pradesh", created_at=datetime.now(UTC)
    )
    # Donor without coordinates: must fall back to the verified list, not crash.
    donor_without_location = SimpleNamespace(location=None)
    session = QueueSession(scalars=[[facility]])
    result = asyncio.run(_auto_assign_review_facilities(session, donor_without_location))
    assert result == [facility]
    assert "hospital_profiles.status" in session.statements[0]

    # Donor WITH stored location: ranks via ST_Distance against the donor point.
    donor_with_location = SimpleNamespace(id=uuid4(), location=object())
    session = QueueSession(scalars=[[facility]])
    result = asyncio.run(_auto_assign_review_facilities(session, donor_with_location))
    assert result == [facility]
    assert "ST_Distance" in session.statements[0]
