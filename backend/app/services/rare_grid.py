from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from uuid import UUID


@dataclass(frozen=True, slots=True)
class Candidate:
    donor_id: UUID
    latitude: float
    longitude: float
    blood_type: str
    standby: bool
    eligible: bool


@dataclass(frozen=True, slots=True)
class RankedCandidate:
    donor_id: UUID
    distance_km: float


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371.0088 * asin(sqrt(a))


def select_micro_tier(
    candidates: list[Candidate],
    origin: tuple[float, float],
    compatible_types: set[str],
    radius_km: float = 15,
    limit: int = 5,
) -> list[RankedCandidate]:
    if radius_km not in {15, 30}:
        raise ValueError("Rare grid radius must be 15 km or 30 km")
    ranked = []
    for candidate in candidates:
        if not (candidate.standby and candidate.eligible and candidate.blood_type in compatible_types):
            continue
        distance = haversine_km(*origin, candidate.latitude, candidate.longitude)
        if distance <= radius_km:
            ranked.append(RankedCandidate(candidate.donor_id, round(distance, 3)))
    return sorted(ranked, key=lambda item: item.distance_km)[:limit]
