import hashlib
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import (
    BloodRequest,
    HospitalProfile,
    NotificationOutbox,
    RequestStatus,
    RequestUrgency,
    RequisitionDocument,
    User,
)
from app.schemas.api import RequestCreate, ResolveRequest, VerificationDecision
from app.services.audit import append_audit_event
from app.services.privacy import PrivacyVault

router = APIRouter(prefix="/requests", tags=["blood requests"])


async def _verified_profile(session: AsyncSession, user_id: UUID) -> HospitalProfile:
    profile = await session.scalar(select(HospitalProfile).where(HospitalProfile.user_id == user_id))
    if profile is None or profile.status != "VERIFIED":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super Admin verification is required before publishing demands")
    return profile


def _request_view(request: BloodRequest, facility_name: str | None = None) -> dict:
    return {
        "id": str(request.id), "facility_name": facility_name, "blood_type": request.blood_type,
        "phenotype_code": request.phenotype_code, "component_type": request.component_type,
        "units_needed": request.units_needed, "urgency": request.urgency.value,
        "status": request.status.value, "expires_at": request.expires_at,
        "verified_at": request.verified_at, "resolved_at": request.resolved_at,
    }


@router.post("/documents", status_code=status.HTTP_201_CREATED)
async def upload_requisition_document(
    upload: UploadFile,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    hospital_user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await _verified_profile(session, hospital_user.id)
    allowed_types = {"application/pdf", "image/jpeg", "image/png"}
    if upload.content_type not in allowed_types:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PDF, JPEG, or PNG requisitions are accepted")
    content = await upload.read(settings.max_upload_bytes + 1)
    if not content or len(content) > settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Requisition document exceeds the configured limit")
    key = f"req-{uuid4()}"
    digest = hashlib.sha256(content).digest()
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    document = RequisitionDocument(
        hospital_user_id=hospital_user.id,
        object_key=key,
        original_filename=(upload.filename or "requisition")[:255],
        content_type=upload.content_type,
        encrypted_content=vault.encrypt_bytes(content, context=f"requisition:{key}"),
        sha256=digest,
        size_bytes=len(content),
    )
    session.add(document)
    await session.flush()
    await append_audit_event(
        session, actor_uid=actor.uid, action="REQUISITION_DOCUMENT_UPLOADED",
        resource_type="requisition_document", resource_id=document.id,
        metadata={"content_type": upload.content_type, "size_bytes": len(content)},
    )
    await session.commit()
    return {"object_key": key, "sha256": digest.hex()}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: RequestCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    hospital_user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    profile = await _verified_profile(session, hospital_user.id)
    document = await session.scalar(
        select(RequisitionDocument).where(
            RequisitionDocument.object_key == payload.document_object_key,
            RequisitionDocument.hospital_user_id == hospital_user.id,
        )
    )
    if document is None or document.sha256.hex().lower() != payload.document_sha256_hex.lower():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Requisition document reference is invalid")
    already_linked = await session.scalar(
        select(BloodRequest.id).where(BloodRequest.document_object_key == payload.document_object_key)
    )
    if already_linked is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Requisition document is already linked to a demand")
    if profile.location is None and (payload.latitude is None or payload.longitude is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Facility coordinates are required for this demand")
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    request = BloodRequest(
        hospital_user_id=hospital_user.id,
        patient_reference_hash=vault.keyed_hash(payload.patient_reference.strip()),
        blood_type=payload.blood_type,
        phenotype_code=payload.phenotype_code,
        component_type=payload.component_type,
        units_needed=payload.units_needed,
        urgency=RequestUrgency(payload.urgency),
        document_object_key=payload.document_object_key,
        document_sha256=bytes.fromhex(payload.document_sha256_hex),
        status=RequestStatus.PENDING,
        expires_at=datetime.now(UTC) + timedelta(hours=payload.expires_in_hours),
        location=(
            profile.location if profile.location is not None else
            ST_SetSRID(ST_MakePoint(payload.longitude, payload.latitude), 4326)
            if payload.latitude is not None and payload.longitude is not None else None
        ),
    )
    session.add(request)
    await session.flush()
    await append_audit_event(session, actor_uid=actor.uid, action="REQUEST_CREATED", resource_type="blood_request", resource_id=request.id)
    await session.commit()
    return {"request_id": str(request.id), "status": request.status.value}


@router.get("/mine")
async def list_my_requests(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    hospital_user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    profile = await _verified_profile(session, hospital_user.id)
    requests = (
        await session.scalars(
            select(BloodRequest).where(BloodRequest.hospital_user_id == hospital_user.id)
            .order_by(BloodRequest.created_at.desc()).limit(250)
        )
    ).all()
    return [_request_view(item, profile.facility_name) for item in requests]


@router.post("/{request_id}/verify")
async def verify_request(
    request_id: UUID,
    decision: VerificationDecision,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    reviewer: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    request = await session.scalar(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if "ROLE_SUPER_ADMIN" not in actor.roles:
        await _verified_profile(session, reviewer.id)
    if request.hospital_user_id != reviewer.id and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the requesting verified facility may review this demand")
    if request.status is not RequestStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only pending requests may be reviewed")
    if decision.decision == "VERIFIED" and not (decision.physician_registration_confirmed and decision.component_confirmed):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Required clinical checks are not confirmed")
    request.status = RequestStatus(decision.decision)
    request.verified_by_user_id = reviewer.id
    request.verified_at = datetime.now(UTC)
    if request.status is RequestStatus.VERIFIED:
        session.add(NotificationOutbox(topic=f"request:{request.id}", event_type="REQUEST_VERIFIED", payload_json={"request_id": str(request.id), "urgency": request.urgency.value}, available_at=datetime.now(UTC)))
    await append_audit_event(session, actor_uid=actor.uid, action=f"REQUEST_{decision.decision}", resource_type="blood_request", resource_id=request.id, metadata={"reason_code": decision.reason_code})
    await session.commit()
    return {"request_id": str(request.id), "status": request.status.value}


@router.post("/{request_id}/resolve")
async def resolve_request(
    request_id: UUID,
    payload: ResolveRequest,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    resolver: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    request = await session.scalar(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if request.status is not RequestStatus.VERIFIED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only verified requests may be resolved")
    if request.hospital_user_id != resolver.id and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the requesting facility may resolve this demand")
    request.status = RequestStatus.RESOLVED
    request.resolved_at = datetime.now(UTC)
    session.add(NotificationOutbox(topic=f"request:{request.id}", event_type="REQUEST_RESOLVED", payload_json={"request_id": str(request.id)}, available_at=datetime.now(UTC)))
    await append_audit_event(session, actor_uid=actor.uid, action="REQUEST_RESOLVED", resource_type="blood_request", resource_id=request.id, metadata={"receiving_event_id": payload.receiving_event_id, "units_received": payload.units_received})
    await session.commit()
    return {"request_id": str(request.id), "status": request.status.value}
