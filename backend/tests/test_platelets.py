from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.services.platelets import PlateletCandidate, stagger_three_day_schedule


def test_stagger_balances_across_three_days() -> None:
    start = datetime(2026, 8, 17, 8, tzinfo=UTC)
    candidates = [PlateletCandidate(uuid4(), None, True, frozenset({0, 1, 2})) for _ in range(6)]
    assignments = stagger_three_day_schedule(candidates, start)
    assert [sum(a.group_code == group for a in assignments) for group in "ABC"] == [2, 2, 2]


def test_recovery_interval_is_enforced() -> None:
    start = datetime(2026, 8, 17, 8, tzinfo=UTC)
    too_recent = PlateletCandidate(uuid4(), start - timedelta(days=13), True, frozenset({0}))
    eligible = PlateletCandidate(uuid4(), start - timedelta(days=14), True, frozenset({0}))
    assignments = stagger_three_day_schedule([too_recent, eligible], start)
    assert [a.donor_id for a in assignments] == [eligible.donor_id]


def test_vein_suitability_is_required() -> None:
    start = datetime(2026, 8, 17, 8, tzinfo=UTC)
    candidate = PlateletCandidate(uuid4(), None, False, frozenset({0, 1, 2}))
    assert stagger_three_day_schedule([candidate], start) == []
