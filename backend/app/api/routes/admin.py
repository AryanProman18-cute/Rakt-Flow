from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import Invitation, User
from app.schemas.accounts import InvitationCreate, RoleUpdate
from app.services.audit import append_audit_event
from app.services.email import EmailDelivery, generate_magic_sign_in_link, send_role_invitation
from app.services.roles import active_roles, push_firebase_claims, replace_roles

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/users")
async def list_users(
    actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    users = list((await session.scalars(select(User).order_by(User.created_at.desc()).limit(250))).all())
    result = []
    for user in users:
        result.append(
            {
                "id": str(user.id),
                "email": user.email,
                "roles": sorted(await active_roles(session, user.id)),
                "active": user.is_active,
                "created_at": user.created_at,
            }
        )
    return result


@router.get("/invitations")
async def list_invitations(
    actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    invitations = list(
        (await session.scalars(select(Invitation).order_by(Invitation.created_at.desc()).limit(250))).all()
    )
    return [
        {
            "id": str(item.id),
            "email": item.email,
            "roles": item.roles,
            "status": item.status,
            "expires_at": item.expires_at,
            "sent_at": item.sent_at,
        }
        for item in invitations
    ]


@router.post("/invitations", status_code=status.HTTP_201_CREATED)
async def create_invitation(
    payload: InvitationCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    admin_user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    email = str(payload.email).strip().lower()
    invitation = Invitation(
        email=email,
        roles=payload.roles,
        invited_by_user_id=admin_user.id,
        status="PENDING",
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    session.add(invitation)
    await session.flush()
    await append_audit_event(
        session,
        actor_uid=actor.uid,
        action="ACCESS_INVITATION_CREATED",
        resource_type="invitation",
        resource_id=invitation.id,
        metadata={"email_domain": email.rsplit("@", 1)[-1], "roles": payload.roles},
    )
    await session.commit()

    try:
        link = await generate_magic_sign_in_link(email, settings)
        delivery = await send_role_invitation(email=email, roles=payload.roles, link=link, settings=settings)
        invitation.sent_at = datetime.now(UTC) if delivery.status == "SENT" else None
        await session.commit()
    except Exception:
        delivery = EmailDelivery(status="FAILED")

    response = {
        "invitation_id": str(invitation.id),
        "email": email,
        "roles": payload.roles,
        "status": invitation.status,
        "delivery": delivery.status,
    }
    if settings.app_env != "production" and delivery.development_link:
        response["development_link"] = delivery.development_link
    return response


@router.put("/users/{user_id}/roles")
async def update_user_roles(
    user_id: UUID,
    payload: RoleUpdate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    admin_user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    target = await session.scalar(select(User).where(User.id == user_id).with_for_update())
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == admin_user.id and "ROLE_SUPER_ADMIN" not in payload.roles:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own Super Admin role")
    roles = await replace_roles(session, target, set(payload.roles), granted_by_user_id=admin_user.id)
    await append_audit_event(
        session,
        actor_uid=actor.uid,
        action="USER_ROLES_REPLACED",
        resource_type="user",
        resource_id=target.id,
        metadata={"roles": sorted(roles)},
    )
    await session.commit()
    await push_firebase_claims(target, roles)
    return {"user_id": str(target.id), "email": target.email, "roles": sorted(roles), "token_refresh_required": True}


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: UUID,
    active: bool,
    actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    admin_user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    target = await session.scalar(select(User).where(User.id == user_id).with_for_update())
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == admin_user.id and not active:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot disable your own account")
    target.is_active = active
    await append_audit_event(session, actor_uid=actor.uid, action="USER_STATUS_CHANGED", resource_type="user", resource_id=target.id, metadata={"active": active})
    await session.commit()
    return {"user_id": str(target.id), "active": target.is_active}
