from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.database import get_session
from app.core.security import Actor, current_actor
from app.models.entities import ConsentRecord, DonorProfile, User, UserPreference
from app.services.audit import append_audit_event

router = APIRouter(prefix="/preferences", tags=["account preferences"])


class PreferenceUpdate(BaseModel):
    appearance: Literal["LIGHT", "DARK", "SYSTEM"]
    language: Literal["en", "hi", "te", "ta", "kn", "ml", "bn", "mr"]
    in_app_notifications: bool
    email_notifications: bool
    sms_notifications: bool
    rare_blood_opt_in: bool
    location_matching_opt_in: bool
    donation_lifecycle_opt_in: bool


def view(row: UserPreference) -> dict:
    return {
        "appearance": row.appearance, "language": row.language,
        "in_app_notifications": row.in_app_notifications,
        "email_notifications": row.email_notifications,
        "sms_notifications": row.sms_notifications,
        "rare_blood_opt_in": row.rare_blood_opt_in,
        "location_matching_opt_in": row.location_matching_opt_in,
        "donation_lifecycle_opt_in": row.donation_lifecycle_opt_in,
    }


async def get_or_create(session: AsyncSession, user: User) -> UserPreference:
    row = await session.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    if row is None:
        row = UserPreference(user_id=user.id)
        session.add(row)
        await session.flush()
    return row


@router.get("/me")
async def my_preferences(
    _actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    row = await get_or_create(session, user)
    await session.commit()
    return view(row)


@router.put("/me")
async def update_preferences(
    payload: PreferenceUpdate,
    actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    row = await get_or_create(session, user)
    previous = view(row)
    submitted = payload.model_dump()
    for key, value in submitted.items():
        setattr(row, key, value)
    purpose_map = {
        "email_notifications": "OPTIONAL_EMAIL_NOTIFICATIONS",
        "sms_notifications": "OPTIONAL_SMS_NOTIFICATIONS",
        "rare_blood_opt_in": "OPTIONAL_RARE_BLOOD_MATCHING",
        "location_matching_opt_in": "OPTIONAL_NEARBY_LOCATION_MATCHING",
        "donation_lifecycle_opt_in": "OPTIONAL_DONATION_LIFECYCLE_UPDATES",
    }
    now = datetime.now(UTC)
    for field, purpose in purpose_map.items():
        if previous[field] != submitted[field]:
            session.add(ConsentRecord(
                user_id=user.id, purpose_code=purpose, granted=submitted[field],
                notice_version="DPDP-PLAIN-2026-01", captured_at=now,
                withdrawn_at=None if submitted[field] else now,
                source="SETTINGS", metadata_json={"preference": field},
            ))
    if previous["location_matching_opt_in"] and not submitted["location_matching_opt_in"]:
        donor = await session.scalar(
            select(DonorProfile).where(DonorProfile.user_id == user.id).with_for_update()
        )
        if donor:
            donor.location = None
    await append_audit_event(
        session, actor_uid=actor.uid, action="ACCOUNT_PREFERENCES_UPDATED",
        resource_type="user", resource_id=user.id,
        metadata={
            "rare_blood_opt_in": row.rare_blood_opt_in,
            "location_matching_opt_in": row.location_matching_opt_in,
        },
    )
    await session.commit()
    return view(row)
