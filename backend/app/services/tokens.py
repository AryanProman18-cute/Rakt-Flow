import hashlib
import hmac
from datetime import UTC, datetime, timedelta

import jwt


class DonorPassIssuer:
    def __init__(self, secret: str) -> None:
        self.secret = secret

    def decode(self, token: str) -> dict[str, object]:
        claims = jwt.decode(token, self.secret, algorithms=["HS256"], options={"require": ["sub", "sid", "exp", "purpose"]})
        if claims.get("purpose") != "donor-checkin":
            raise jwt.InvalidTokenError("Incorrect token purpose")
        return claims

    def issue(self, donor_id: str, screening_id: str, now: datetime | None = None) -> dict[str, object]:
        now = now or datetime.now(UTC)
        window = int(now.timestamp()) // 30
        expires = datetime.fromtimestamp((window + 1) * 30, tz=UTC)
        offline_until = now + timedelta(hours=12)
        claims = {
            "sub": donor_id,
            "sid": screening_id,
            "purpose": "donor-checkin",
            "iat": int(now.timestamp()),
            "exp": int(expires.timestamp()),
            "window": window,
        }
        token = jwt.encode(claims, self.secret, algorithm="HS256")
        digest = hmac.new(self.secret.encode(), f"{donor_id}:{window}".encode(), hashlib.sha256).digest()
        code = str(int.from_bytes(digest[:4], "big") % 1_000_000).zfill(6)
        return {"token": token, "rotating_code": code, "expires_at": expires, "offline_valid_until": offline_until}
