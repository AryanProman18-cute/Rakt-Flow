import asyncio
from datetime import UTC, datetime

from firebase_admin import auth
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import ALL_ROLES, firebase_app
from app.models.entities import User, UserRoleGrant


async def active_roles(session: AsyncSession, user_id) -> set[str]:
    values = await session.scalars(
        select(UserRoleGrant.role).where(
            UserRoleGrant.user_id == user_id,
            UserRoleGrant.revoked_at.is_(None),
        )
    )
    return set(values).intersection(ALL_ROLES)


async def replace_roles(
    session: AsyncSession,
    user: User,
    roles: set[str],
    granted_by_user_id=None,
) -> set[str]:
    normalized = roles.intersection(ALL_ROLES)
    grants = list(
        (
            await session.scalars(
                select(UserRoleGrant).where(UserRoleGrant.user_id == user.id).with_for_update()
            )
        ).all()
    )
    by_role = {grant.role: grant for grant in grants}
    for role in normalized:
        grant = by_role.get(role)
        if grant:
            grant.revoked_at = None
            grant.granted_by_user_id = granted_by_user_id
        else:
            session.add(
                UserRoleGrant(
                    user_id=user.id,
                    role=role,
                    granted_by_user_id=granted_by_user_id,
                )
            )
    for role, grant in by_role.items():
        if role not in normalized and grant.revoked_at is None:
            grant.revoked_at = datetime.now(UTC)
    return normalized


async def push_firebase_claims(user: User, roles: set[str]) -> None:
    claims = {
        "roles": sorted(roles),
        "role": next(iter(sorted(roles))) if roles else None,
        "super_admin": "ROLE_SUPER_ADMIN" in roles,
    }
    await asyncio.to_thread(auth.set_custom_user_claims, user.firebase_uid, claims, app=firebase_app())
