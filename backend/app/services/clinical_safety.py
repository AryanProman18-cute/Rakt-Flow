from datetime import UTC, datetime
from uuid import UUID

from app.models.entities import Screening


def current_screening_is_approved(
    screening: Screening | None,
    *,
    expected_id: UUID | None = None,
    now: datetime | None = None,
) -> bool:
    """Return true only when the latest selected pre-check is current and approved.

    Callers must select the donor's newest screening first. ``expected_id`` is
    used by QR intake to ensure a token cannot refer to an older approval after
    the donor submits a newer pre-check.
    """
    if screening is None:
        return False
    now = now or datetime.now(UTC)
    if screening.valid_until <= now or screening.review_status != "APPROVED":
        return False
    return expected_id is None or screening.id == expected_id
