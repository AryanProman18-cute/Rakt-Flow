from datetime import UTC, datetime

from app.services.tokens import DonorPassIssuer


def test_pass_is_stable_inside_rotation_window() -> None:
    issuer = DonorPassIssuer("x" * 32)
    a = issuer.issue("donor-1", "screening-1", datetime(2026, 8, 16, 10, 0, 1, tzinfo=UTC))
    b = issuer.issue("donor-1", "screening-1", datetime(2026, 8, 16, 10, 0, 20, tzinfo=UTC))
    assert a["rotating_code"] == b["rotating_code"]
    assert len(a["rotating_code"]) == 6
