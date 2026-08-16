from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID


@dataclass(frozen=True, slots=True)
class PlateletCandidate:
    donor_id: UUID
    last_apheresis_at: datetime | None
    vein_access_suitable: bool
    available_days: frozenset[int]


@dataclass(frozen=True, slots=True)
class PlateletAssignment:
    donor_id: UUID
    group_code: str
    starts_at: datetime
    ends_at: datetime


def stagger_three_day_schedule(
    candidates: list[PlateletCandidate], starts_at: datetime, minimum_recovery_days: int = 14
) -> list[PlateletAssignment]:
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=UTC)
    assignments: list[PlateletAssignment] = []
    eligible = [
        c for c in candidates
        if c.vein_access_suitable
        and (c.last_apheresis_at is None or starts_at - c.last_apheresis_at >= timedelta(days=minimum_recovery_days))
    ]
    day_load = [0, 0, 0]
    for candidate in eligible:
        available = [day for day in range(3) if day in candidate.available_days]
        if not available:
            continue
        day = min(available, key=lambda index: (day_load[index], index))
        day_load[day] += 1
        window_start = starts_at + timedelta(days=day)
        assignments.append(PlateletAssignment(candidate.donor_id, chr(65 + day), window_start, window_start + timedelta(hours=6)))
    return assignments
