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
