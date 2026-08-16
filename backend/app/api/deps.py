from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import Actor, current_actor
from app.models.entities import User


async def database_user(
    session: Annotated[AsyncSession, Depends(get_session)],
    actor: Annotated[Actor, Depends(current_actor)],
) -> User:
    user = await session.scalar(select(User).where(User.firebase_uid == actor.uid, User.is_active.is_(True)))
    if user is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Authenticated account has no active RaktFlow profile")
    return user
