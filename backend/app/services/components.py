from datetime import datetime, timedelta

# Conservative operational defaults only. A verified facility must apply its
# licensed SOP, additive solution, storage temperature, irradiation and local
# regulation before relying on an expiry timestamp.
DEFAULT_SHELF_LIFE_DAYS = {
    "WHOLE_BLOOD": 35,
    "PRBC": 42,
    "RBC": 42,
    "SDP": 5,
    "RDP": 5,
    "PLATELETS": 5,
    "FFP": 365,
    "CRYOPRECIPITATE": 365,
}

TEMPERATURE_RANGES_C = {
    "WHOLE_BLOOD": (1.0, 6.0),
    "PRBC": (1.0, 6.0),
    "RBC": (1.0, 6.0),
    "SDP": (20.0, 24.0),
    "RDP": (20.0, 24.0),
    "PLATELETS": (20.0, 24.0),
    "FFP": (-40.0, -18.0),
    "CRYOPRECIPITATE": (-40.0, -18.0),
}


def default_expiry(component_type: str, prepared_at: datetime) -> datetime:
    days = DEFAULT_SHELF_LIFE_DAYS.get(component_type.upper(), 35)
    return prepared_at + timedelta(days=days)


def temperature_status(component_type: str, value: float) -> str:
    limits = TEMPERATURE_RANGES_C.get(component_type.upper())
    if limits is None:
        return "REVIEW_REQUIRED"
    low, high = limits
    return "IN_RANGE" if low <= value <= high else "OUT_OF_RANGE_REVIEW_REQUIRED"


# Lifecycle events that move a unit towards a recipient. Forwarding an expired
# unit is never permitted — this is the hard release gate described in the
# operational blueprint: the API refuses, and the UI shows the locked state.
FORWARDING_EVENTS = {"RESERVED", "RELEASED", "ISSUED", "TRANSFUSED"}

# Statuses a unit may legitimately move from, mapped per forwarding event.
_ALLOWED_FROM = {
    "RESERVED": {"COLLECTED", "AVAILABLE", "QUARANTINED", "RESERVED"},
    "RELEASED": {"COLLECTED", "AVAILABLE", "QUARANTINED", "RESERVED"},
    "ISSUED": {"AVAILABLE", "RESERVED"},
    "TRANSFUSED": {"ISSUED"},
}


def verify_status_transition(
    current_status: str,
    event_type: str,
    expires_at: datetime,
    occurred_at: datetime,
) -> None:
    """Validate a component lifecycle event before it is recorded.

    Raises ValueError with an actionable message when the transition is not
    permitted. Callers translate this into the API rejection (HTTP 409) and the
    UI surfaces the reason as a tooltip / locked-state note.
    """
    if event_type in FORWARDING_EVENTS and expires_at <= occurred_at:
        raise ValueError("Expired units cannot be reserved, released, issued or transfused")
    if event_type == "ISSUED" and current_status == "ISSUED":
        raise ValueError("This unit is already issued to a recipient")
    if event_type == "TRANSFUSED" and current_status != "ISSUED":
        raise ValueError("Only an issued unit can be recorded as transfused")
    allowed_from = _ALLOWED_FROM.get(event_type)
    if allowed_from is not None and current_status not in allowed_from:
        raise ValueError(
            f"A {event_type.lower()} event is not permitted from status {current_status.lower()}"
        )
