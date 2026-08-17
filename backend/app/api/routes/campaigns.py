from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import Campaign, CampaignVisit, Drive, DriveRegistration, User
from app.schemas.integrated import (
    CampaignCreate,
    CampaignShare,
    CampaignUpdate,
    CampaignVisitCreate,
)
from app.services.audit import append_audit_event
from app.services.email import EmailDelivery, send_campaign_share
from app.services.privacy import PrivacyVault

router = APIRouter(tags=["campaigns"])


def _drive_view(drive: Drive) -> dict:
    return {
        "id": str(drive.id),
        "name": drive.name,
        "venue_name": drive.venue_name,
        "address": drive.address,
        "starts_at": drive.starts_at,
        "ends_at": drive.ends_at,
        "target_units": drive.target_units,
        "status": drive.status,
    }


def _view(campaign: Campaign, drive: Drive, settings: Settings) -> dict:
    return {
        "id": str(campaign.id),
        "slug": campaign.slug,
        "title": campaign.title,
        "description": campaign.description,
        "poster": campaign.poster_json,
        "status": campaign.status,
        "published_at": campaign.published_at,
        "registration_url": f"{settings.public_app_url.rstrip('/')}?campaign={campaign.slug}",
        "drive": _drive_view(drive),
    }


async def _owned_campaign(
    session: AsyncSession, actor: Actor, user: User, campaign_id: UUID
) -> tuple[Campaign, Drive]:
    row = (
        await session.execute(
            select(Campaign, Drive).join(Drive, Drive.id == Campaign.drive_id).where(Campaign.id == campaign_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    campaign, drive = row
    if campaign.organizer_user_id != user.id and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the campaign owner or Super Admin may manage it")
    return campaign, drive


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    drive = await session.get(Drive, payload.drive_id)
    if drive is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drive not found")
    if drive.organizer_user_id != user.id and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Campaigns can be created only for your drive")
    campaign = Campaign(
        drive_id=drive.id,
        organizer_user_id=drive.organizer_user_id,
        slug=payload.slug,
        title=payload.title.strip(),
        description=payload.description.strip(),
        poster_json=payload.poster.model_dump(),
        status="DRAFT",
    )
    session.add(campaign)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That campaign link is already in use") from exc
    await append_audit_event(
        session, actor_uid=actor.uid, action="CAMPAIGN_CREATED",
        resource_type="campaign", resource_id=campaign.id, metadata={"drive_id": str(drive.id)},
    )
    await session.commit()
    return _view(campaign, drive, settings)


@router.get("/campaigns/mine")
async def list_my_campaigns(
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    query = (
        select(Campaign, Drive)
        .join(Drive, Drive.id == Campaign.drive_id)
        .order_by(Campaign.created_at.desc())
        .limit(250)
    )
    if "ROLE_SUPER_ADMIN" not in actor.roles:
        query = query.where(Campaign.organizer_user_id == user.id)
    rows = (await session.execute(query)).all()
    return [_view(campaign, drive, settings) for campaign, drive in rows]


@router.patch("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: UUID,
    payload: CampaignUpdate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    campaign, drive = await _owned_campaign(session, actor, user, campaign_id)
    changes = payload.model_dump(exclude_unset=True)
    poster = changes.pop("poster", None)
    if changes.get("status") == "PUBLISHED":
        if drive.status not in {"APPROVED", "ACTIVE"} or drive.ends_at <= datetime.now(UTC):
            raise HTTPException(status.HTTP_409_CONFLICT, "Approve and open the drive before publishing its campaign")
        campaign.published_at = campaign.published_at or datetime.now(UTC)
    for field, value in changes.items():
        setattr(campaign, field, value)
    if poster is not None:
        campaign.poster_json = poster
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That campaign link is already in use") from exc
    await append_audit_event(
        session, actor_uid=actor.uid, action="CAMPAIGN_UPDATED",
        resource_type="campaign", resource_id=campaign.id, metadata={"fields": sorted(payload.model_dump(exclude_unset=True))},
    )
    await session.commit()
    return _view(campaign, drive, settings)


@router.get("/campaigns/{campaign_id}/stats")
async def campaign_stats(
    campaign_id: UUID,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    campaign, _drive = await _owned_campaign(session, actor, user, campaign_id)
    visitors = int(await session.scalar(select(func.count()).select_from(CampaignVisit).where(CampaignVisit.campaign_id == campaign.id)) or 0)
    total_visits = int(await session.scalar(select(func.coalesce(func.sum(CampaignVisit.visit_count), 0)).where(CampaignVisit.campaign_id == campaign.id)) or 0)
    registrations = int(await session.scalar(select(func.count()).select_from(DriveRegistration).where(DriveRegistration.source_campaign_id == campaign.id, DriveRegistration.status != "CANCELLED")) or 0)
    return {
        "campaign_id": str(campaign.id),
        "unique_visitors": visitors,
        "total_visits": total_visits,
        "registrations": registrations,
        "conversion_percent": round((registrations / visitors) * 100, 1) if visitors else 0,
    }


@router.post("/campaigns/{campaign_id}/share")
async def share_campaign(
    campaign_id: UUID,
    payload: CampaignShare,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    campaign, drive = await _owned_campaign(session, actor, user, campaign_id)
    if campaign.status != "PUBLISHED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Publish the campaign before sharing it")
    link = f"{settings.public_app_url.rstrip('/')}?campaign={campaign.slug}"
    summary = f"{drive.name} · {drive.venue_name or drive.address or ''} · {drive.starts_at.isoformat()}"
    try:
        delivery = await send_campaign_share(
            recipient=str(payload.recipient_email), campaign_title=campaign.title,
            drive_summary=summary, link=link, personal_message=payload.personal_message,
            settings=settings,
        )
    except Exception:
        delivery = EmailDelivery(status="FAILED")
    await append_audit_event(
        session, actor_uid=actor.uid, action="CAMPAIGN_EMAIL_REQUESTED",
        resource_type="campaign", resource_id=campaign.id,
        metadata={"recipient_domain": str(payload.recipient_email).rsplit("@", 1)[-1], "delivery": delivery.status},
    )
    await session.commit()
    return {"campaign_id": str(campaign.id), "delivery": delivery.status}


@router.get("/public/campaigns/{slug}")
async def public_campaign(
    slug: str,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    row = (
        await session.execute(
            select(Campaign, Drive)
            .join(Drive, Drive.id == Campaign.drive_id)
            .where(func.lower(Campaign.slug) == slug.strip().lower(), Campaign.status == "PUBLISHED")
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    campaign, drive = row
    if drive.status not in {"APPROVED", "ACTIVE"} or drive.ends_at <= datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "This campaign is no longer open")
    return _view(campaign, drive, settings)


@router.post("/public/campaigns/{slug}/visit", status_code=status.HTTP_202_ACCEPTED)
async def record_campaign_visit(
    slug: str,
    payload: CampaignVisitCreate,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    campaign = await session.scalar(
        select(Campaign).where(func.lower(Campaign.slug) == slug.strip().lower(), Campaign.status == "PUBLISHED")
    )
    if campaign is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    visitor_hash = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper).keyed_hash(payload.visitor_key)
    visit = await session.scalar(
        select(CampaignVisit).where(
            CampaignVisit.campaign_id == campaign.id,
            CampaignVisit.visitor_hash == visitor_hash,
        ).with_for_update()
    )
    now = datetime.now(UTC)
    if visit is None:
        visit = CampaignVisit(
            campaign_id=campaign.id,
            visitor_hash=visitor_hash,
            first_visited_at=now,
            last_visited_at=now,
            visit_count=1,
        )
        session.add(visit)
    else:
        visit.last_visited_at = now
        visit.visit_count += 1
    await session.commit()
    return {"recorded": True}
