import base64
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest

from app.api.routes.accounts import age_on
from app.core.config import Settings
from app.schemas.accounts import ScreeningSubmission
from app.schemas.components import ComponentPolicyItem, ComponentSplit
from app.services.components import default_expiry, temperature_status
from app.services.ocr import extract_fields, match_requisition
from app.services.privacy import PrivacyVault


def test_ocr_extracts_blood_date_and_facility_candidates():
    fields = extract_fields("Rasapudipalem Blood Bank\nGroup: O-\n19/08/2026")
    assert fields["blood_groups"] == ["O-"]
    assert fields["document_dates"] == ["2026-08-19"]
    assert fields["facility_candidates"] == ["Rasapudipalem Blood Bank"]


def test_ocr_matching_still_requires_human_review():
    status, document_date, reasons = match_requisition(
        {
            "blood_groups": ["O-"],
            "document_dates": [datetime.now(UTC).date().isoformat()],
            "facility_candidates": ["Rasapudipalem Blood Bank"],
        },
        blood_type="O-",
        facility_name="Rasapudipalem Blood Bank",
    )
    assert status == "OCR_MATCHED_REVIEW_REQUIRED"
    assert document_date == datetime.now(UTC).date()
    assert reasons == []


def test_ocr_mismatch_never_auto_verifies():
    status, _date, reasons = match_requisition(
        {"blood_groups": ["A+"], "document_dates": [], "facility_candidates": []},
        blood_type="B-",
        facility_name="Verified Hospital",
    )
    assert status == "OCR_MISMATCH_REVIEW_REQUIRED"
    assert "BLOOD_GROUP_NOT_FOUND_OR_MISMATCH" in reasons


def test_default_expiry_is_component_specific_operational_fallback():
    prepared = datetime(2026, 8, 19, tzinfo=UTC)
    assert default_expiry("PLATELETS", prepared) == prepared + timedelta(days=5)
    assert default_expiry("PRBC", prepared) == prepared + timedelta(days=42)


def test_temperature_status_requires_quarantine_review_outside_default_range():
    assert temperature_status("PRBC", 4.0) == "IN_RANGE"
    assert temperature_status("PRBC", 9.0) == "OUT_OF_RANGE_REVIEW_REQUIRED"
    assert temperature_status("UNKNOWN_COMPONENT", 4.0) == "REVIEW_REQUIRED"


def test_component_policy_rejects_invalid_shelf_life():
    try:
        ComponentPolicyItem(
            component_type="PRBC",
            shelf_life_hours=0,
            policy_reference="Facility SOP",
        )
    except ValueError:
        pass
    else:
        raise AssertionError("zero-hour shelf life must be rejected")


def production_settings(**overrides):
    values = {
        "app_env": "production", "allow_dev_auth": False,
        "token_signing_secret": "x" * 40, "firebase_project_id": "raktflow",
        "bootstrap_admin_email": "admin@example.org", "phone_hash_pepper": "p" * 32,
        "pii_encryption_key": "a", "public_app_url": "https://raktflow.example.org",
        "cors_origins": ["https://raktflow.example.org"],
    } | overrides
    return Settings(_env_file=None, **values)


def test_production_rejects_wildcard_cors_origin():
    settings = production_settings(cors_origins=["*"])
    try:
        settings.validate_production()
    except RuntimeError as error:
        assert "Wildcard CORS" in str(error)
    else:
        raise AssertionError("production must reject wildcard origins")


def test_production_rejects_non_https_frontend():
    settings = production_settings(public_app_url="http://raktflow.example.org")
    try:
        settings.validate_production()
    except RuntimeError as error:
        assert "HTTPS" in str(error)
    else:
        raise AssertionError("production must require HTTPS")


def screening_payload() -> dict:
    return {
        "questionnaire_version": "IN-PRECHECK-2026-02", "weight_kg": 60,
        "feeling_well_today": True, "fever_infection_or_antibiotics": False,
        "medication_requires_review": False,
        "heart_lung_kidney_liver_or_bleeding_condition": False,
        "surgery_transfusion_or_hospitalization_last_12_months": False,
        "tattoo_or_piercing_last_12_months": False,
        "malaria_risk_travel_or_residence": False,
        "pregnancy_breastfeeding_or_recent_delivery": None,
        "alcohol_within_24_hours": False, "recent_immunization_14_days": False,
        "answers_are_truthful": True,
        "consent_to_clinical_review": True,
    }


def test_screening_no_longer_requires_selected_facility_consent():
    """The donor no longer picks a review facility; the server auto-assigns one."""
    payload = screening_payload()
    parsed = ScreeningSubmission(**payload)
    assert parsed.consent_to_selected_facility_review is False
    assert parsed.review_hospital_id is None


def test_screening_still_accepts_an_explicit_review_facility():
    payload = screening_payload()
    payload["review_hospital_id"] = uuid4()
    payload["consent_to_selected_facility_review"] = True
    parsed = ScreeningSubmission(**payload)
    assert parsed.review_hospital_id == payload["review_hospital_id"]
    assert parsed.consent_to_selected_facility_review is True


def test_adult_age_gate_calculation_handles_birthdays():
    assert age_on(date(2000, 8, 19), date(2026, 8, 19)) == 26
    assert age_on(date(2000, 8, 20), date(2026, 8, 19)) == 25


def test_data_rights_details_encryption_round_trip():
    key = base64.urlsafe_b64encode(b"k" * 32).decode()
    vault = PrivacyVault(key, "p" * 32)
    encrypted = vault.encrypt_bytes(b"Please correct my city", context="data-rights:test")
    assert b"correct my city" not in encrypted
    assert vault.decrypt_bytes(encrypted, context="data-rights:test") == b"Please correct my city"


def test_split_requires_at_least_one_component():
    try:
        ComponentSplit(prepared_at=datetime.now(UTC), components=[], sop_confirmation=True)
    except ValueError:
        pass
    else:
        raise AssertionError("empty component separation must be rejected")


def test_component_release_gates_block_unsafe_forwarding():
    from datetime import UTC, datetime, timedelta

    from app.services.components import verify_status_transition

    now = datetime.now(UTC)
    future_expiry = now + timedelta(days=30)
    past_expiry = now - timedelta(minutes=1)

    # Healthy flow: quarantine -> release -> issue -> transfuse is allowed.
    verify_status_transition("QUARANTINED", "RELEASED", future_expiry, now)
    verify_status_transition("AVAILABLE", "ISSUED", future_expiry, now)
    verify_status_transition("ISSUED", "TRANSFUSED", future_expiry, now)

    # Expired units can never move towards a recipient (hard release gate).
    with pytest.raises(ValueError, match="Expired"):
        verify_status_transition("AVAILABLE", "ISSUED", past_expiry, now)
    with pytest.raises(ValueError, match="Expired"):
        verify_status_transition("QUARANTINED", "RELEASED", past_expiry, now)

    # Double issue is blocked.
    with pytest.raises(ValueError, match="already issued"):
        verify_status_transition("ISSUED", "ISSUED", future_expiry, now)

    # Transfusion is only valid from an issued unit.
    with pytest.raises(ValueError, match="issued unit"):
        verify_status_transition("AVAILABLE", "TRANSFUSED", future_expiry, now)

    # Discard of an expired unit is still allowed (safe disposition).
    verify_status_transition("AVAILABLE", "DISCARDED", past_expiry, now)
