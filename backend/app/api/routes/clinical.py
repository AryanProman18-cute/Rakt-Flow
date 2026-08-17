from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import DonorProfile, Screening, User
from app.schemas.integrated import ScreeningReview
from app.services.audit import append_audit_event

router = APIRouter(prefix="/clinical", tags=["clinical review"])


def _age(born: date | None) -> int | None:
    if born is None:
        return None
    today = datetime.now(UTC).date()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def _view(screening: Screening, donor: DonorProfile) -> dict:
    return {
        "screening_id": str(screening.id),
        "donor_reference": donor.reference_code,
        "display_name": donor.display_name,
        "age": _age(donor.date_of_birth),
        "blood_type": donor.blood_type,
        "city": donor.city,
        "outcome": screening.outcome,
        "flags": screening.flags,
        "attested_at": screening.attested_at,
        "valid_until": screening.valid_until,
        "review_status": screening.review_status,
        "reviewed_at": screening.reviewed_at,
        "review_note": screening.review_note,
    }


@router.get("/screenings")
async def list_screening_queue(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    review_status: str = "PENDING",
) -> list[dict]:
    normalized = review_status.upper()
    if normalized not in {"PENDING", "APPROVED", "DECLINED", "ALL"}:
        raise HTTPException(422, "Unknown screening review status")
    query = (
        select(Screening, DonorProfile)
        .join(DonorProfile, DonorProfile.id == Screening.donor_id)
        .order_by(Screening.created_at.desc())
        .limit(250)
    )
    if normalized != "ALL":
        query = query.where(Screening.review_status == normalized)
    rows = (await session.execute(query)).all()
    return [_view(screening, donor) for screening, donor in rows]


@router.post("/screenings/{screening_id}/decision")
async def review_screening(
    screening_id: UUID,
    payload: ScreeningReview,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    reviewer: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    row = (
        await session.execute(
            select(Screening, DonorProfile)
            .join(DonorProfile, DonorProfile.id == Screening.donor_id)
            .where(Screening.id == screening_id)
            .with_for_update()
        )
    ).first()
    if row is None:
        raise HTTPException(404, "Screening not found")
    screening, donor = row
    if screening.review_status != "PENDING":
        raise HTTPException(409, "This screening already has a reviewer decision")
    if screening.valid_until <= datetime.now(UTC):
        raise HTTPException(409, "This screening has expired; ask the donor to submit a new pre-check")
    screening.review_status = payload.decision
    screening.reviewed_by_user_id = reviewer.id
    screening.reviewed_at = datetime.now(UTC)
    screening.review_note = payload.note.strip() or None
    await append_audit_event(
        session,
        actor_uid=actor.uid,
        action=f"SCREENING_QR_{payload.decision}",
        resource_type="screening",
        resource_id=screening.id,
        metadata={"donor_reference": donor.reference_code},
    )
    await session.commit()
    return _view(screening, donor)
