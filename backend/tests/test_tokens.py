from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.services.tokens import DonorPassIssuer


def test_pass_is_stable_inside_rotation_window() -> None:
    issuer = DonorPassIssuer("x" * 32)
    now = datetime.now(UTC)
    base = datetime.fromtimestamp(now.timestamp() - (now.timestamp() % 90), tz=UTC)
    a = issuer.issue("donor-1", "screening-1", base + timedelta(seconds=1))
    b = issuer.issue("donor-1", "screening-1", base + timedelta(seconds=20))
    assert a["rotating_code"] == b["rotating_code"]
    assert len(a["rotating_code"]) == 6


def test_pass_cannot_expire_the_moment_it_is_issued() -> None:
    issuer = DonorPassIssuer("x" * 32)
    now = datetime.now(UTC)
    base = datetime.fromtimestamp(now.timestamp() - (now.timestamp() % 90), tz=UTC)
    issued = issuer.issue("donor-1", "screening-1", base + timedelta(seconds=89))
    remaining = (issued["expires_at"] - (base + timedelta(seconds=89))).total_seconds()
    assert remaining >= 1  # never "already expired" the instant it is shown


def test_issued_pass_decodes_with_expected_claims() -> None:
    issuer = DonorPassIssuer("x" * 32)
    issued = issuer.issue("donor-1", "screening-1", datetime.now(UTC))
    decoded = issuer.decode(issued["token"])
    assert decoded["sub"] == "donor-1"
    assert decoded["sid"] == "screening-1"
    assert decoded["purpose"] == "donor-checkin"


def test_decode_tolerates_small_clock_skew() -> None:
    issuer = DonorPassIssuer("x" * 32)
    now = datetime.now(UTC)
    # Token expiring just behind the scanner clock, still inside the 10s leeway.
    token = jwt.encode(
        {
            "sub": "donor-1",
            "sid": "screening-1",
            "purpose": "donor-checkin",
            "iat": int(now.timestamp()) - 200,
            "exp": int(now.timestamp()) - 5,
        },
        issuer.secret,
        algorithm="HS256",
    )
    decoded = issuer.decode(token)
    assert decoded["sub"] == "donor-1"


def test_expired_pass_beyond_leeway_is_rejected() -> None:
    issuer = DonorPassIssuer("x" * 32)
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": "donor-1",
            "sid": "screening-1",
            "purpose": "donor-checkin",
            "iat": int(now.timestamp()) - 400,
            "exp": int(now.timestamp()) - 120,
        },
        issuer.secret,
        algorithm="HS256",
    )
    with pytest.raises(jwt.ExpiredSignatureError):
        issuer.decode(token)


def test_wrong_purpose_is_rejected() -> None:
    issuer = DonorPassIssuer("x" * 32)
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": "donor-1",
            "sid": "screening-1",
            "purpose": "something-else",
            "iat": int(now.timestamp()),
            "exp": int(now.timestamp()) + 90,
        },
        issuer.secret,
        algorithm="HS256",
    )
    with pytest.raises(jwt.InvalidTokenError):
        issuer.decode(token)
