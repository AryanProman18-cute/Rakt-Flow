from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import CheckIn, Drive, User
from app.schemas.api import BatchResult, CheckInBatch, CheckInCreate
from app.services.audit import append_audit_event

router = APIRouter(prefix="/checkins", tags=["drive intake"])


async def insert_items(
    session: AsyncSession, actor: Actor, scanner: User, items: list[CheckInCreate], offline: bool
) -> BatchResult:
    drive_ids = {item.drive_id for item in items}
    owned_drive_ids = set(
        await session.scalars(
            select(Drive.id).where(
                Drive.id.in_(drive_ids),
                Drive.organizer_user_id == scanner.id,
                Drive.status.in_(["APPROVED", "ACTIVE"]),
            )
        )
    )
    if "ROLE_SUPER_ADMIN" not in actor.roles and owned_drive_ids != drive_ids:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Every check-in must belong to an approved drive owned by this organizer")
    if any(item.clearance_status != "PENDING_REVIEW" for item in items):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Organizer check-in cannot assert clinical clearance")
    values = [
        {
            "drive_id": item.drive_id,
            "donor_id": item.donor_id,
            "scanner_user_id": scanner.id,
            "idempotency_key": item.idempotency_key,
            "scanned_at": item.scanned_at,
            "clearance_status": item.clearance_status,
            "source": "OFFLINE_REPLAY" if offline else "ONLINE",
        }
        for item in items
    ]
    result = await session.execute(
        insert(CheckIn).values(values).on_conflict_do_nothing(index_elements=["idempotency_key"]).returning(CheckIn.id)
    )
    inserted = list(result.scalars())
    await append_audit_event(
        session,
        actor_uid=actor.uid,
        action="CHECKINS_BATCH_RECORDED",
        resource_type="drive_checkin",
        resource_id=None,
        metadata={"accepted": len(inserted), "submitted": len(items), "offline_replay": offline},
    )
    await session.commit()
    return BatchResult(accepted=len(inserted), duplicates=len(items) - len(inserted))


@router.post("", response_model=BatchResult)
async def check_in(
    item: CheckInCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    scanner: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BatchResult:
    return await insert_items(session, actor, scanner, [item], offline=False)


@router.post("/batch", response_model=BatchResult)
async def replay_batch(
    payload: CheckInBatch,
    actor: Annotated[Actor, Depends(require_roles("ROLE_ORGANIZER"))],
    scanner: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BatchResult:
    return await insert_items(session, actor, scanner, payload.items, offline=True)
