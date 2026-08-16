from uuid import uuid4

from app.services.rare_grid import Candidate, haversine_km, select_micro_tier


def test_haversine_is_symmetric() -> None:
    a = (17.6868, 83.2185)
    b = (17.7231, 83.3013)
    assert haversine_km(*a, *b) == haversine_km(*b, *a)
    assert 9 < haversine_km(*a, *b) < 11


def test_micro_tier_filters_and_sorts() -> None:
    origin = (17.6868, 83.2185)
    near, far, opted_out, incompatible = uuid4(), uuid4(), uuid4(), uuid4()
    candidates = [
        Candidate(far, 17.75, 83.26, "O-", True, True),
        Candidate(near, 17.69, 83.22, "O-", True, True),
        Candidate(opted_out, 17.691, 83.221, "O-", False, True),
        Candidate(incompatible, 17.692, 83.222, "B-", True, True),
    ]
    selected = select_micro_tier(candidates, origin, {"O-"})
    assert [item.donor_id for item in selected] == [near, far]


def test_micro_tier_rejects_arbitrary_radius() -> None:
    try:
        select_micro_tier([], (0, 0), {"O-"}, radius_km=25)
    except ValueError as exc:
        assert "15 km or 30 km" in str(exc)
    else:
        raise AssertionError("arbitrary radius should be rejected")
