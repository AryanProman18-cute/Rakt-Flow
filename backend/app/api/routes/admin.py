from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import (
    AuditEvent,
    BloodRequest,
    Campaign,
    CheckIn,
    DonationRecord,
    DonorProfile,
    Drive,
    DriveRegistration,
    HospitalProfile,
    Invitation,
    User,
)
from app.schemas.accounts import InvitationCreate, RoleUpdate
from app.services.audit import append_audit_event
from app.services.email import EmailDelivery, send_role_invitation
from app.services.roles import active_roles, push_firebase_claims, replace_roles

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/overview")
async def platform_overview(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    async def count(model, *conditions) -> int:
        statement = select(func.count()).select_from(model)
        if conditions:
            statement = statement.where(*conditions)
        return int(await session.scalar(statement) or 0)

    return {
        "users": await count(User),
        "active_users": await count(User, User.is_active.is_(True)),
        "donor_profiles": await count(DonorProfile),
        "pending_invitations": await count(Invitation, Invitation.status == "PENDING"),
        "pending_hospitals": await count(HospitalProfile, HospitalProfile.status == "PENDING"),
        "verified_hospitals": await count(HospitalProfile, HospitalProfile.status == "VERIFIED"),
        "drives": await count(Drive),
        "open_drives": await count(Drive, Drive.status.in_(["APPROVED", "ACTIVE"])),
        "registrations": await count(DriveRegistration, DriveRegistration.status != "CANCELLED"),
        "checkins": await count(CheckIn),
        "donations": await count(DonationRecord),
        "campaigns": await count(Campaign),
        "blood_requests": await count(BloodRequest),
    }


@router.get("/data")
async def platform_data(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    donors = (await session.scalars(select(DonorProfile).order_by(DonorProfile.created_at.desc()).limit(250))).all()
    drives = (await session.scalars(select(Drive).order_by(Drive.created_at.desc()).limit(250))).all()
    hospitals = (await session.scalars(select(HospitalProfile).order_by(HospitalProfile.created_at.desc()).limit(250))).all()
    campaigns = (await session.scalars(select(Campaign).order_by(Campaign.created_at.desc()).limit(250))).all()
    registrations = (await session.scalars(select(DriveRegistration).order_by(DriveRegistration.registered_at.desc()).limit(500))).all()
    donations = (await session.scalars(select(DonationRecord).order_by(DonationRecord.collected_at.desc()).limit(500))).all()
    requests = (await session.scalars(select(BloodRequest).order_by(BloodRequest.created_at.desc()).limit(250))).all()
    return {
        "donors": [
            {
                "id": str(item.id), "reference_code": item.reference_code, "display_name": item.display_name,
                "blood_type": item.blood_type, "city": item.city, "profile_status": item.profile_status,
                "identity_verified": item.identity_verified_at is not None, "created_at": item.created_at,
            }
            for item in donors
        ],
        "drives": [
            {
                "id": str(item.id), "name": item.name, "venue_name": item.venue_name,
                "address": item.address, "starts_at": item.starts_at, "ends_at": item.ends_at,
                "target_units": item.target_units, "status": item.status,
            }
            for item in drives
        ],
        "hospitals": [
            {
                "id": str(item.id), "facility_name": item.facility_name,
                "registration_number": item.registration_number, "institutional_email": item.institutional_email,
                "city": item.city, "state": item.state, "status": item.status, "created_at": item.created_at,
            }
            for item in hospitals
        ],
        "campaigns": [
            {"id": str(item.id), "drive_id": str(item.drive_id), "slug": item.slug, "title": item.title, "status": item.status, "created_at": item.created_at}
            for item in campaigns
        ],
        "registrations": [
            {"id": str(item.id), "drive_id": str(item.drive_id), "donor_id": str(item.donor_id), "status": item.status, "registered_at": item.registered_at}
            for item in registrations
        ],
        "donations": [
            {"id": str(item.id), "drive_id": str(item.drive_id), "donor_id": str(item.donor_id), "unit_reference": item.unit_reference, "blood_type": item.blood_type_at_collection, "component_type": item.component_type, "volume_ml": item.volume_ml, "collected_at": item.collected_at}
            for item in donations
        ],
        "requests": [
            {"id": str(item.id), "hospital_user_id": str(item.hospital_user_id), "blood_type": item.blood_type, "component_type": item.component_type, "units_needed": item.units_needed, "urgency": item.urgency.value, "status": item.status.value, "expires_at": item.expires_at}
            for item in requests
        ],
    }


@router.get("/audit")
async def audit_trail(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    events = (await session.scalars(select(AuditEvent).order_by(AuditEvent.occurred_at.desc()).limit(500))).all()
    return [
        {
            "id": str(event.id), "occurred_at": event.occurred_at, "actor_uid": event.actor_uid,
            "action": event.action, "resource_type": event.resource_type,
            "resource_id": str(event.resource_id) if event.resource_id else None,
            "metadata": event.metadata_json,
        }
        for event in events
    ]


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
            "delivery_status": item.delivery_status,
            "delivery_provider_id": item.delivery_provider_id,
            "last_delivery_at": item.last_delivery_at,
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
        delivery = await send_role_invitation(
            email=email, roles=payload.roles, invitation_id=invitation.id, settings=settings
        )
        now = datetime.now(UTC)
        invitation.sent_at = now if delivery.status == "SENT" else None
        invitation.delivery_status = delivery.status
        invitation.delivery_provider_id = delivery.provider_id
        invitation.last_delivery_at = now
        await session.commit()
    except Exception:
        delivery = EmailDelivery(status="FAILED")
        invitation.delivery_status = delivery.status
        invitation.last_delivery_at = datetime.now(UTC)
        await session.commit()

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


@router.post("/invitations/{invitation_id}/resend")
async def resend_invitation(
    invitation_id: UUID,
    actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    invitation = await session.scalar(
        select(Invitation).where(Invitation.id == invitation_id).with_for_update()
    )
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    if invitation.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only pending invitations can be resent")
    if invitation.expires_at <= datetime.now(UTC):
        invitation.expires_at = datetime.now(UTC) + timedelta(days=7)
    try:
        delivery = await send_role_invitation(
            email=invitation.email,
            roles=invitation.roles,
            invitation_id=invitation.id,
            settings=settings,
        )
    except Exception:
        delivery = EmailDelivery(status="FAILED")
    now = datetime.now(UTC)
    invitation.delivery_status = delivery.status
    invitation.delivery_provider_id = delivery.provider_id
    invitation.last_delivery_at = now
    invitation.sent_at = now if delivery.status == "SENT" else invitation.sent_at
    await append_audit_event(
        session,
        actor_uid=actor.uid,
        action="ACCESS_INVITATION_RESENT",
        resource_type="invitation",
        resource_id=invitation.id,
        metadata={"delivery": delivery.status},
    )
    await session.commit()
    return {
        "invitation_id": str(invitation.id),
        "status": invitation.status,
        "delivery": invitation.delivery_status,
        "sent_at": invitation.sent_at,
        "last_delivery_at": invitation.last_delivery_at,
    }


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
