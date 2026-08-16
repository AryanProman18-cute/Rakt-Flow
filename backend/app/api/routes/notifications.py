import hashlib
import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, current_actor
from app.models.entities import PushSubscription, User
from app.schemas.operations import PushSubscriptionCreate
from app.services.audit import append_audit_event
from app.services.privacy import PrivacyVault

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/config")
async def notification_config(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    return {"push_available": bool(settings.vapid_public_key), "vapid_public_key": settings.vapid_public_key}


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
async def save_push_subscription(
    payload: PushSubscriptionCreate,
    actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
    user_agent: Annotated[str | None, Header()] = None,
) -> dict:
    endpoint_hash = hashlib.sha256(payload.endpoint.encode()).digest()
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    encrypted = vault.encrypt_bytes(
        json.dumps(payload.model_dump(), separators=(",", ":")).encode(),
        context=f"push-subscription:{user.id}",
    )
    statement = insert(PushSubscription).values(
        user_id=user.id,
        endpoint_hash=endpoint_hash,
        encrypted_subscription=encrypted,
        user_agent=(user_agent or "")[:300] or None,
        active=True,
        failure_count=0,
    ).on_conflict_do_update(
        index_elements=[PushSubscription.endpoint_hash],
        set_={
            "user_id": user.id,
            "encrypted_subscription": encrypted,
            "user_agent": (user_agent or "")[:300] or None,
            "active": True,
            "failure_count": 0,
        },
    ).returning(PushSubscription.id)
    subscription_id = await session.scalar(statement)
    await append_audit_event(
        session, actor_uid=actor.uid, action="PUSH_SUBSCRIPTION_SAVED",
        resource_type="push_subscription", resource_id=subscription_id,
    )
    await session.commit()
    return {"subscription_id": str(subscription_id), "active": True}
