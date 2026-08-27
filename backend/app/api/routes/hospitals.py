import hashlib
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, status
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.security import Actor, current_actor, require_roles
from app.models.entities import (
    BloodInventory,
    HospitalApplicationDocument,
    HospitalProfile,
    InventoryEvent,
    User,
)
from app.schemas.operations import HospitalApplication, HospitalVerification, InventoryMutation
from app.services.audit import append_audit_event
from app.services.email import EmailDelivery, send_hospital_application_notification
from app.services.privacy import PrivacyVault, normalize_phone
from app.services.roles import active_roles, push_firebase_claims, replace_roles

router = APIRouter(prefix="/hospitals", tags=["hospitals"])


def _profile_view(profile: HospitalProfile) -> dict:
    return {
        "id": str(profile.id),
        "facility_name": profile.facility_name,
        "registration_number": profile.registration_number,
        "institutional_email": profile.institutional_email,
        "address": profile.address,
        "city": profile.city,
        "state": profile.state,
        "status": profile.status,
        "verified_at": profile.verified_at,
        "rejection_reason": profile.rejection_reason,
    }


@router.post("/applications", status_code=status.HTTP_201_CREATED)
async def apply_for_hospital_account(
    payload: HospitalApplication,
    actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if not actor.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Verify your email before applying")
    existing = await session.scalar(select(HospitalProfile).where(HospitalProfile.user_id == user.id))
    if existing is not None and existing.status != "REJECTED":
        raise HTTPException(status.HTTP_409_CONFLICT, "A hospital application already exists for this account")
    if existing is not None and existing.status == "REJECTED":
        # A rejected applicant may resubmit an updated application under the
        # same profile row (one application per account, updated in place).
        for field_name in ("facility_name", "registration_number", "institutional_email",
                           "address", "city", "state"):
            setattr(existing, field_name, getattr(payload, field_name).strip())
        existing.registration_number = payload.registration_number.strip()
        existing.institutional_email = str(payload.institutional_email).lower()
        existing.rejection_reason = None
        existing.status = "PENDING"
        profile = existing
    else:
        duplicate = await session.scalar(
            select(HospitalProfile.id).where(
                func.lower(HospitalProfile.registration_number)
                == payload.registration_number.strip().lower()
            )
        )
        if duplicate is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This registration number already has an application")
        profile = HospitalProfile(
            user_id=user.id,
            facility_name=payload.facility_name.strip(),
            registration_number=payload.registration_number.strip(),
            institutional_email=str(payload.institutional_email).lower(),
            address=payload.address.strip(),
            city=payload.city.strip(),
            state=payload.state.strip(),
            status="PENDING",
        )
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    try:
        normalized_phone = normalize_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    profile.phone_encrypted = vault.encrypt_text(normalized_phone, context=f"hospital-phone:{user.id}")
    profile.location = None
    if payload.latitude is not None and payload.longitude is not None:
        profile.location = ST_SetSRID(ST_MakePoint(payload.longitude, payload.latitude), 4326)
    if profile.id is None:
        session.add(profile)
    await session.flush()
    await append_audit_event(
        session, actor_uid=actor.uid, action="HOSPITAL_APPLICATION_CREATED" if existing is None else "HOSPITAL_APPLICATION_RESUBMITTED",
        resource_type="hospital_profile", resource_id=profile.id,
    )
    await session.commit()
    try:
        delivery = await send_hospital_application_notification(
            application_id=profile.id,
            facility_name=profile.facility_name,
            applicant_email=actor.email,
            settings=settings,
        )
    except Exception:
        delivery = EmailDelivery(status="FAILED")
    return _profile_view(profile) | {"notification_delivery": delivery.status}


async def _application_for_document_access(
    hospital_id: UUID,
    actor: Actor,
    user: User,
    session: AsyncSession,
) -> HospitalProfile:
    profile = await session.get(HospitalProfile, hospital_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hospital application not found")
    if profile.user_id != user.id and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This application belongs to another account")
    return profile


@router.post("/{hospital_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_hospital_application_document(
    hospital_id: UUID,
    upload: UploadFile,
    actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    profile = await _application_for_document_access(hospital_id, actor, user, session)
    if profile.status != "PENDING" and "ROLE_SUPER_ADMIN" not in actor.roles:
        raise HTTPException(status.HTTP_409_CONFLICT, "Documents can only be added while review is pending")
    allowed_types = {"application/pdf", "image/jpeg", "image/png"}
    if upload.content_type not in allowed_types:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PDF, JPEG, or PNG evidence is accepted")
    content = await upload.read(settings.max_upload_bytes + 1)
    if not content or len(content) > settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Evidence document exceeds the configured limit")
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    document = HospitalApplicationDocument(
        hospital_id=profile.id,
        uploader_user_id=user.id,
        original_filename=(upload.filename or "facility-evidence")[:255],
        content_type=upload.content_type,
        encrypted_content=vault.encrypt_bytes(content, context=f"hospital-document:{profile.id}"),
        sha256=hashlib.sha256(content).digest(),
        size_bytes=len(content),
    )
    session.add(document)
    await session.flush()
    await append_audit_event(
        session, actor_uid=actor.uid, action="HOSPITAL_DOCUMENT_UPLOADED",
        resource_type="hospital_application_document", resource_id=document.id,
        metadata={"hospital_id": str(profile.id), "content_type": document.content_type, "size_bytes": len(content)},
    )
    await session.commit()
    return {
        "id": str(document.id), "hospital_id": str(profile.id),
        "original_filename": document.original_filename, "content_type": document.content_type,
        "size_bytes": document.size_bytes, "sha256": document.sha256.hex(),
    }


@router.get("/{hospital_id}/documents")
async def list_hospital_application_documents(
    hospital_id: UUID,
    actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    await _application_for_document_access(hospital_id, actor, user, session)
    documents = (
        await session.scalars(
            select(HospitalApplicationDocument)
            .where(HospitalApplicationDocument.hospital_id == hospital_id)
            .order_by(HospitalApplicationDocument.created_at.desc())
        )
    ).all()
    return [
        {
            "id": str(document.id), "original_filename": document.original_filename,
            "content_type": document.content_type, "size_bytes": document.size_bytes,
            "sha256": document.sha256.hex(), "created_at": document.created_at,
        }
        for document in documents
    ]


@router.get("/{hospital_id}/documents/{document_id}")
async def download_hospital_application_document(
    hospital_id: UUID,
    document_id: UUID,
    actor: Annotated[Actor, Depends(current_actor)],
    user: Annotated[User, Depends(database_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    profile = await _application_for_document_access(hospital_id, actor, user, session)
    document = await session.scalar(
        select(HospitalApplicationDocument).where(
            HospitalApplicationDocument.id == document_id,
            HospitalApplicationDocument.hospital_id == profile.id,
        )
    )
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application document not found")
    vault = PrivacyVault(settings.pii_encryption_key, settings.phone_hash_pepper)
    content = vault.decrypt_bytes(document.encrypted_content, context=f"hospital-document:{profile.id}")
    safe_name = document.original_filename.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        content=content,
        media_type=document.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/me")
async def get_my_hospital(
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    profile = await session.scalar(select(HospitalProfile).where(HospitalProfile.user_id == user.id))
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hospital application exists")
    return _profile_view(profile)


@router.get("/applications")
async def list_hospital_applications(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    application_status: str | None = Query(default=None, alias="status"),
) -> list[dict]:
    query = select(HospitalProfile).order_by(HospitalProfile.created_at.desc()).limit(250)
    if application_status:
        query = query.where(HospitalProfile.status == application_status.upper())
    profiles = (await session.scalars(query)).all()
    return [_profile_view(profile) for profile in profiles]


@router.post("/{hospital_id}/verification")
async def decide_hospital_application(
    hospital_id: UUID,
    payload: HospitalVerification,
    actor: Annotated[Actor, Depends(require_roles("ROLE_SUPER_ADMIN"))],
    admin_user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    profile = await session.scalar(
        select(HospitalProfile).where(HospitalProfile.id == hospital_id).with_for_update()
    )
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hospital application not found")
    account = await session.get(User, profile.user_id)
    if account is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Hospital account no longer exists")
    if payload.decision == "VERIFIED":
        evidence_count = await session.scalar(
            select(func.count()).select_from(HospitalApplicationDocument).where(
                HospitalApplicationDocument.hospital_id == profile.id
            )
        )
        if not evidence_count:
            raise HTTPException(status.HTTP_409_CONFLICT, "Review at least one facility evidence document before verification")
    profile.status = payload.decision
    profile.verified_by_user_id = admin_user.id
    profile.verified_at = datetime.now(UTC) if payload.decision == "VERIFIED" else None
    profile.rejection_reason = payload.note or None
    roles = await active_roles(session, account.id)
    if payload.decision == "VERIFIED":
        roles.add("ROLE_HOSPITAL")
    else:
        roles.discard("ROLE_HOSPITAL")
    roles = await replace_roles(session, account, roles, granted_by_user_id=admin_user.id)
    await append_audit_event(
        session, actor_uid=actor.uid, action=f"HOSPITAL_{payload.decision}",
        resource_type="hospital_profile", resource_id=profile.id, metadata={"note": payload.note},
    )
    await session.commit()
    await push_firebase_claims(account, roles)
    return _profile_view(profile) | {"roles": sorted(roles), "refresh_token_required": True}


async def _verified_hospital(session: AsyncSession, user_id: UUID) -> HospitalProfile:
    profile = await session.scalar(select(HospitalProfile).where(HospitalProfile.user_id == user_id))
    if profile is None or profile.status != "VERIFIED":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super Admin verification is required for hospital operations")
    return profile


@router.get("/inventory/me")
async def list_my_inventory(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    profile = await _verified_hospital(session, user.id)
    rows = (
        await session.scalars(
            select(BloodInventory).where(BloodInventory.hospital_id == profile.id).order_by(
                BloodInventory.blood_type, BloodInventory.component_type
            )
        )
    ).all()
    return [
        {
            "id": str(row.id), "blood_type": row.blood_type, "phenotype_code": row.phenotype_code,
            "component_type": row.component_type, "units_available": row.units_available,
            "units_reserved": row.units_reserved, "minimum_level": row.minimum_level,
            "is_low": row.units_available - row.units_reserved <= row.minimum_level,
        }
        for row in rows
    ]


@router.post("/inventory/events", status_code=status.HTTP_201_CREATED)
async def record_inventory_event(
    payload: InventoryMutation,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    profile = await _verified_hospital(session, user.id)
    phenotype_code = payload.phenotype_code or "STANDARD"
    inventory = await session.scalar(
        select(BloodInventory).where(
            BloodInventory.hospital_id == profile.id,
            BloodInventory.blood_type == payload.blood_type,
            BloodInventory.component_type == payload.component_type,
            BloodInventory.phenotype_code == phenotype_code,
        ).with_for_update()
    )
    if inventory is None:
        if payload.event_type != "RECEIPT" and not (
            payload.event_type == "ADJUSTMENT" and payload.adjustment_direction != "DECREASE"
        ):
            raise HTTPException(status.HTTP_409_CONFLICT, "Receive or positively adjust inventory before issuing it")
        inventory = BloodInventory(
            hospital_id=profile.id, blood_type=payload.blood_type,
            phenotype_code=phenotype_code, component_type=payload.component_type,
            units_available=0, minimum_level=payload.minimum_level if payload.minimum_level is not None else 2,
        )
        session.add(inventory)
        await session.flush()
    positive = payload.event_type == "RECEIPT" or (
        payload.event_type == "ADJUSTMENT" and payload.adjustment_direction != "DECREASE"
    )
    delta = payload.units if positive else -payload.units
    resulting = inventory.units_available + delta
    if resulting < inventory.units_reserved or resulting < 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Inventory cannot fall below reserved or zero units")
    inventory.units_available = resulting
    if payload.minimum_level is not None:
        inventory.minimum_level = payload.minimum_level
    event = InventoryEvent(
        inventory_id=inventory.id, hospital_id=profile.id, actor_user_id=user.id,
        event_type=payload.event_type, delta_units=delta, resulting_units=resulting,
        reference=payload.reference, reason=payload.reason or None, occurred_at=datetime.now(UTC),
    )
    session.add(event)
    await session.flush()
    await append_audit_event(
        session, actor_uid=actor.uid, action=f"INVENTORY_{payload.event_type}",
        resource_type="inventory_event", resource_id=event.id,
        metadata={"blood_type": payload.blood_type, "component": payload.component_type, "delta": delta},
    )
    await session.commit()
    return {"event_id": str(event.id), "inventory_id": str(inventory.id), "resulting_units": resulting}


@router.get("/inventory/events")
async def list_inventory_events(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    profile = await _verified_hospital(session, user.id)
    events = (
        await session.scalars(
            select(InventoryEvent).where(InventoryEvent.hospital_id == profile.id).order_by(
                InventoryEvent.occurred_at.desc()
            ).limit(250)
        )
    ).all()
    return [
        {
            "id": str(event.id), "event_type": event.event_type, "delta_units": event.delta_units,
            "resulting_units": event.resulting_units, "reference": event.reference,
            "reason": event.reason, "occurred_at": event.occurred_at,
        }
        for event in events
    ]
