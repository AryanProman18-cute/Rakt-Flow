from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import database_user
from app.core.database import get_session
from app.core.security import Actor, require_roles
from app.models.entities import (
    BloodComponent,
    BloodUnit,
    ColdChainHandover,
    ComponentEvent,
    ComponentShelfLifePolicy,
    DonationRecord,
    DonorProfile,
    DonorUnitNotification,
    HospitalProfile,
    NotificationOutbox,
    User,
    UserPreference,
)
from app.schemas.components import (
    ComponentPolicyUpdate,
    ComponentReceive,
    ComponentSplit,
    ComponentStatusEvent,
    HandoverCreate,
    HandoverReceive,
)
from app.services.audit import append_audit_event
from app.services.components import default_expiry, temperature_status

router = APIRouter(prefix="/components", tags=["component traceability"])


async def verified_hospital(session: AsyncSession, user_id: UUID) -> HospitalProfile:
    profile = await session.scalar(select(HospitalProfile).where(HospitalProfile.user_id == user_id))
    if profile is None or profile.status != "VERIFIED":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "A verified hospital or blood-bank profile is required")
    return profile


async def active_policy(
    session: AsyncSession, hospital_id: UUID, component_type: str
) -> ComponentShelfLifePolicy | None:
    return await session.scalar(select(ComponentShelfLifePolicy).where(
        ComponentShelfLifePolicy.hospital_id == hospital_id,
        ComponentShelfLifePolicy.component_type == component_type,
        ComponentShelfLifePolicy.active.is_(True),
    ))


async def facility_temperature_status(
    session: AsyncSession, hospital_id: UUID, component_type: str, value: float
) -> str:
    policy = await active_policy(session, hospital_id, component_type)
    if policy and policy.minimum_temperature_c is not None and policy.maximum_temperature_c is not None:
        return (
            "IN_RANGE" if float(policy.minimum_temperature_c) <= value <= float(policy.maximum_temperature_c)
            else "OUT_OF_RANGE_REVIEW_REQUIRED"
        )
    return temperature_status(component_type, value)


def expiry_state(component: BloodComponent) -> str:
    now = datetime.now(UTC)
    if component.status in {"TRANSFUSED", "DISCARDED"}:
        return component.status
    if component.expires_at <= now:
        return "EXPIRED"
    if component.expires_at <= now + timedelta(hours=24):
        return "EXPIRES_WITHIN_24_HOURS"
    if component.expires_at <= now + timedelta(days=3):
        return "EXPIRES_SOON"
    return "WITHIN_POLICY_WINDOW"


def component_view(component: BloodComponent) -> dict:
    return {
        "id": str(component.id), "blood_unit_id": str(component.blood_unit_id),
        "parent_component_id": str(component.parent_component_id) if component.parent_component_id else None,
        "component_reference": component.component_reference, "isbt128_code": component.isbt128_code,
        "component_type": component.component_type, "blood_type": component.blood_type,
        "volume_ml": component.volume_ml, "collected_at": component.collected_at,
        "prepared_at": component.prepared_at, "expires_at": component.expires_at,
        "current_hospital_id": str(component.current_hospital_id) if component.current_hospital_id else None,
        "status": component.status, "expiry_state": expiry_state(component),
        "policy_notice": "Expiry is a configurable operational default; the licensed facility SOP controls release and disposal.",
    }


@router.get("/policies/mine")
async def my_component_policies(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    hospital = await verified_hospital(session, user.id)
    rows = (await session.scalars(
        select(ComponentShelfLifePolicy).where(ComponentShelfLifePolicy.hospital_id == hospital.id)
        .order_by(ComponentShelfLifePolicy.component_type)
    )).all()
    return [{
        "id": str(row.id), "component_type": row.component_type,
        "shelf_life_hours": row.shelf_life_hours,
        "minimum_temperature_c": float(row.minimum_temperature_c) if row.minimum_temperature_c is not None else None,
        "maximum_temperature_c": float(row.maximum_temperature_c) if row.maximum_temperature_c is not None else None,
        "policy_reference": row.policy_reference, "active": row.active,
    } for row in rows]


@router.put("/policies/mine")
async def update_component_policies(
    payload: ComponentPolicyUpdate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    if not payload.authorized_confirmation:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Authorized facility policy confirmation is required")
    hospital = await verified_hospital(session, user.id)
    rows = list((await session.scalars(
        select(ComponentShelfLifePolicy).where(ComponentShelfLifePolicy.hospital_id == hospital.id).with_for_update()
    )).all())
    by_type = {row.component_type: row for row in rows}
    for item in payload.policies:
        if (
            item.minimum_temperature_c is not None and item.maximum_temperature_c is not None
            and item.minimum_temperature_c > item.maximum_temperature_c
        ):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Minimum temperature cannot exceed maximum temperature")
        row = by_type.get(item.component_type)
        if row is None:
            row = ComponentShelfLifePolicy(
                hospital_id=hospital.id, component_type=item.component_type,
                shelf_life_hours=item.shelf_life_hours, policy_reference=item.policy_reference,
                verified_by_user_id=user.id,
            )
            session.add(row)
            rows.append(row)
        row.shelf_life_hours = item.shelf_life_hours
        row.minimum_temperature_c = item.minimum_temperature_c
        row.maximum_temperature_c = item.maximum_temperature_c
        row.policy_reference = item.policy_reference
        row.verified_by_user_id = user.id
        row.active = item.active
    await append_audit_event(
        session, actor_uid=actor.uid, action="COMPONENT_POLICIES_UPDATED",
        resource_type="hospital_profile", resource_id=hospital.id,
        metadata={"component_types": [item.component_type for item in payload.policies]},
    )
    await session.commit()
    return await my_component_policies(actor, user, session)


@router.get("/mine")
async def my_components(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    hospital = await verified_hospital(session, user.id)
    rows = (await session.scalars(
        select(BloodComponent).where(BloodComponent.current_hospital_id == hospital.id)
        .order_by(BloodComponent.expires_at, BloodComponent.component_reference).limit(1000)
    )).all()
    return [component_view(row) for row in rows]


@router.get("/expiry-summary")
async def expiry_summary(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    hospital = await verified_hospital(session, user.id)
    rows = (await session.scalars(
        select(BloodComponent).where(BloodComponent.current_hospital_id == hospital.id)
    )).all()
    counts = {"EXPIRED": 0, "EXPIRES_WITHIN_24_HOURS": 0, "EXPIRES_SOON": 0, "WITHIN_POLICY_WINDOW": 0}
    for row in rows:
        state = expiry_state(row)
        if state in counts:
            counts[state] += 1
    return counts | {"total_active": sum(counts.values())}


@router.post("/receive")
async def receive_component(
    payload: ComponentReceive,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    hospital = await verified_hospital(session, user.id)
    code = payload.scanned_code.strip()
    component = await session.scalar(
        select(BloodComponent).join(BloodUnit, BloodUnit.id == BloodComponent.blood_unit_id).where(
            or_(
                BloodComponent.component_reference == code,
                BloodComponent.isbt128_code == code,
                BloodUnit.unit_reference == code,
            )
        ).order_by(BloodComponent.created_at).limit(1).with_for_update()
    )
    if component is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No collected unit or component matches that scanned code")
    unit = await session.get(BloodUnit, component.blood_unit_id)
    donation = await session.get(DonationRecord, unit.donation_record_id)
    if donation.recorded_by_user_id == user.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Separation of duties requires another verified staff member to receive this collected unit",
        )
    if component.current_hospital_id == hospital.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This component is already held by the facility; record a lifecycle event instead",
        )
    if component.current_hospital_id and component.current_hospital_id != hospital.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "A recorded cold-chain handover is required between facilities")
    component.current_hospital_id = hospital.id
    component.status = "QUARANTINED" if component.expires_at <= payload.received_at else "AVAILABLE"
    temp_state = await facility_temperature_status(
        session, hospital.id, component.component_type, payload.temperature_c
    )
    if temp_state != "IN_RANGE":
        component.status = "QUARANTINED"
    session.add(ComponentEvent(
        component_id=component.id, actor_user_id=user.id, hospital_id=hospital.id,
        event_type="RECEIVED", occurred_at=payload.received_at,
        temperature_c=payload.temperature_c, event_reference=payload.event_reference,
        metadata_json={"temperature_status": temp_state},
    ))
    await append_audit_event(
        session, actor_uid=actor.uid, action="COMPONENT_RECEIVED", resource_type="blood_component",
        resource_id=component.id, metadata={"temperature_status": temp_state},
    )
    await session.commit()
    return component_view(component) | {"temperature_status": temp_state}


@router.post("/{component_id}/split", status_code=status.HTTP_201_CREATED)
async def split_component(
    component_id: UUID,
    payload: ComponentSplit,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    if not payload.sop_confirmation:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Facility SOP confirmation is required")
    hospital = await verified_hospital(session, user.id)
    parent = await session.scalar(select(BloodComponent).where(BloodComponent.id == component_id).with_for_update())
    if parent is None or parent.current_hospital_id != hospital.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Component is not held by this facility")
    if parent.status in {"TRANSFUSED", "DISCARDED", "COMPONENTIZED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "This component can no longer be separated")
    children = []
    for item in payload.components:
        policy = await active_policy(session, hospital.id, item.component_type)
        expires_at = (
            payload.prepared_at + timedelta(hours=policy.shelf_life_hours)
            if policy else default_expiry(item.component_type, payload.prepared_at)
        )
        child = BloodComponent(
            blood_unit_id=parent.blood_unit_id, parent_component_id=parent.id,
            component_reference=item.component_reference.strip(),
            isbt128_code=item.isbt128_code.strip() if item.isbt128_code else None,
            component_type=item.component_type, blood_type=parent.blood_type,
            volume_ml=item.volume_ml, collected_at=parent.collected_at,
            prepared_at=payload.prepared_at,
            expires_at=expires_at,
            current_hospital_id=hospital.id, status="AVAILABLE",
        )
        session.add(child)
        children.append(child)
    parent.status = "COMPONENTIZED"
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A component or ISBT 128 reference already exists") from exc
    for child in children:
        session.add(ComponentEvent(
            component_id=child.id, actor_user_id=user.id, hospital_id=hospital.id,
            event_type="PREPARED", occurred_at=payload.prepared_at,
            event_reference=child.component_reference,
            metadata_json={"parent_component_id": str(parent.id)},
        ))
    await append_audit_event(
        session, actor_uid=actor.uid, action="COMPONENTS_PREPARED", resource_type="blood_component",
        resource_id=parent.id, metadata={"children": [str(item.id) for item in children]},
    )
    await session.commit()
    return [component_view(item) for item in children]


@router.get("/{component_id}/events")
async def component_events(
    component_id: UUID,
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    hospital = await verified_hospital(session, user.id)
    component = await session.get(BloodComponent, component_id)
    if component is None or component.current_hospital_id != hospital.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Component is not held by this facility")
    rows = (await session.scalars(
        select(ComponentEvent).where(ComponentEvent.component_id == component.id)
        .order_by(ComponentEvent.occurred_at.desc(), ComponentEvent.created_at.desc())
    )).all()
    return [{
        "id": str(row.id), "event_type": row.event_type, "occurred_at": row.occurred_at,
        "hospital_id": str(row.hospital_id) if row.hospital_id else None,
        "temperature_c": float(row.temperature_c) if row.temperature_c is not None else None,
        "event_reference": row.event_reference, "metadata": row.metadata_json,
    } for row in rows]


@router.post("/{component_id}/events")
async def record_component_event(
    component_id: UUID,
    payload: ComponentStatusEvent,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if not payload.authorized_confirmation:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Authorized staff confirmation is required")
    hospital = await verified_hospital(session, user.id)
    component = await session.scalar(select(BloodComponent).where(BloodComponent.id == component_id).with_for_update())
    if component is None or component.current_hospital_id != hospital.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Component is not held by this facility")
    if component.status in {"TRANSFUSED", "DISCARDED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Finalized components are immutable")
    if payload.event_type in {"TRANSFUSED", "DISCARDED"}:
        unit_for_duty_check = await session.get(BloodUnit, component.blood_unit_id)
        donation_for_duty_check = await session.get(
            DonationRecord, unit_for_duty_check.donation_record_id
        )
        if donation_for_duty_check.recorded_by_user_id == user.id:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Final lifecycle disposition requires a second authorized staff member",
            )
    status_map = {
        "RESERVED": "RESERVED", "RELEASED": "AVAILABLE", "ISSUED": "ISSUED",
        "TRANSFUSED": "TRANSFUSED", "DISCARDED": "DISCARDED", "QUARANTINED": "QUARANTINED",
    }
    component.status = status_map[payload.event_type]
    temp_state = (
        await facility_temperature_status(
            session, hospital.id, component.component_type, payload.temperature_c
        ) if payload.temperature_c is not None else None
    )
    if temp_state and temp_state != "IN_RANGE":
        component.status = "QUARANTINED"
    session.add(ComponentEvent(
        component_id=component.id, actor_user_id=user.id, hospital_id=hospital.id,
        event_type=payload.event_type, occurred_at=payload.occurred_at,
        temperature_c=payload.temperature_c, event_reference=payload.event_reference,
        metadata_json={"temperature_status": temp_state, "note": payload.note},
    ))
    if payload.event_type == "TRANSFUSED":
        unit = await session.get(BloodUnit, component.blood_unit_id)
        preference = await session.scalar(
            select(UserPreference).join(DonorProfile, DonorProfile.user_id == UserPreference.user_id)
            .where(DonorProfile.id == unit.donor_id)
        )
        if preference is None or preference.donation_lifecycle_opt_in:
            message = f"Your donated blood component was used by {hospital.facility_name}. No patient identity is disclosed."
            session.add(DonorUnitNotification(
                donor_id=unit.donor_id, blood_unit_id=unit.id, component_id=component.id,
                event_type="COMPONENT_TRANSFUSED", safe_message=message, delivery_status="IN_APP",
                delivered_at=datetime.now(UTC),
            ))
            channels = ["IN_APP"]
            if preference and preference.email_notifications:
                channels.append("EMAIL_READY")
            if preference and preference.sms_notifications:
                channels.append("SMS_READY")
            session.add(NotificationOutbox(
                topic=f"donor:{unit.donor_id}", event_type="DONATION_HELPED_PATIENT",
                payload_json={
                    "component_id": str(component.id), "safe_message": message,
                    "channels": channels,
                }, available_at=datetime.now(UTC),
            ))
    await append_audit_event(
        session, actor_uid=actor.uid, action=f"COMPONENT_{payload.event_type}",
        resource_type="blood_component", resource_id=component.id,
        metadata={"temperature_status": temp_state},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That final component event is already recorded") from exc
    return component_view(component) | {"temperature_status": temp_state}


@router.post("/handovers", status_code=status.HTTP_201_CREATED)
async def create_handover(
    payload: HandoverCreate,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    hospital = await verified_hospital(session, user.id)
    component = await session.scalar(select(BloodComponent).where(BloodComponent.id == payload.component_id).with_for_update())
    destination = await session.get(HospitalProfile, payload.to_hospital_id)
    if component is None or component.current_hospital_id != hospital.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Component is not held by this facility")
    if destination is None or destination.status != "VERIFIED" or destination.id == hospital.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose another verified destination facility")
    if component.status in {"TRANSFUSED", "DISCARDED", "IN_TRANSIT"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Component cannot enter a new handover")
    temp_state = await facility_temperature_status(
        session, hospital.id, component.component_type, payload.dispatch_temperature_c
    )
    handover = ColdChainHandover(
        component_id=component.id, from_hospital_id=hospital.id, to_hospital_id=destination.id,
        handed_over_by_user_id=user.id, handed_over_at=payload.handed_over_at,
        dispatch_temperature_c=payload.dispatch_temperature_c,
        container_reference=payload.container_reference, status="IN_TRANSIT",
        notes=payload.notes.strip() or None,
    )
    session.add(handover)
    component.status = "IN_TRANSIT" if temp_state == "IN_RANGE" else "QUARANTINED_IN_TRANSIT"
    await session.flush()
    await append_audit_event(
        session, actor_uid=actor.uid, action="COLD_CHAIN_HANDOVER_STARTED",
        resource_type="cold_chain_handover", resource_id=handover.id,
        metadata={"temperature_status": temp_state, "destination": str(destination.id)},
    )
    await session.commit()
    return {"handover_id": str(handover.id), "status": handover.status, "temperature_status": temp_state}


@router.get("/handovers/mine")
async def my_handovers(
    _actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    hospital = await verified_hospital(session, user.id)
    rows = (await session.scalars(
        select(ColdChainHandover).where(or_(
            ColdChainHandover.from_hospital_id == hospital.id,
            ColdChainHandover.to_hospital_id == hospital.id,
        )).order_by(ColdChainHandover.handed_over_at.desc()).limit(500)
    )).all()
    return [{
        "id": str(row.id), "component_id": str(row.component_id),
        "from_hospital_id": str(row.from_hospital_id) if row.from_hospital_id else None,
        "to_hospital_id": str(row.to_hospital_id) if row.to_hospital_id else None,
        "handed_over_at": row.handed_over_at, "received_at": row.received_at,
        "dispatch_temperature_c": float(row.dispatch_temperature_c),
        "receipt_temperature_c": float(row.receipt_temperature_c) if row.receipt_temperature_c is not None else None,
        "container_reference": row.container_reference, "status": row.status,
        "can_receive": row.to_hospital_id == hospital.id and row.status == "IN_TRANSIT",
    } for row in rows]


@router.post("/handovers/{handover_id}/receive")
async def receive_handover(
    handover_id: UUID,
    payload: HandoverReceive,
    actor: Annotated[Actor, Depends(require_roles("ROLE_HOSPITAL"))],
    user: Annotated[User, Depends(database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if not payload.receipt_confirmation:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Receipt confirmation is required")
    hospital = await verified_hospital(session, user.id)
    handover = await session.scalar(select(ColdChainHandover).where(ColdChainHandover.id == handover_id).with_for_update())
    if handover is None or handover.to_hospital_id != hospital.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incoming handover not found")
    if handover.status != "IN_TRANSIT":
        raise HTTPException(status.HTTP_409_CONFLICT, "Handover is no longer awaiting receipt")
    if handover.handed_over_by_user_id == user.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The dispatching staff member cannot independently confirm destination receipt",
        )
    component = await session.get(BloodComponent, handover.component_id)
    temp_state = await facility_temperature_status(
        session, hospital.id, component.component_type, payload.receipt_temperature_c
    )
    handover.received_by_user_id = user.id
    handover.received_at = payload.received_at
    handover.receipt_temperature_c = payload.receipt_temperature_c
    handover.status = "RECEIVED" if temp_state == "IN_RANGE" else "RECEIVED_QUARANTINED"
    handover.notes = "\n".join(filter(None, [handover.notes, payload.notes.strip()])) or None
    component.current_hospital_id = hospital.id
    component.status = "AVAILABLE" if temp_state == "IN_RANGE" and component.expires_at > payload.received_at else "QUARANTINED"
    session.add(ComponentEvent(
        component_id=component.id, actor_user_id=user.id, hospital_id=hospital.id,
        event_type="HANDOVER_RECEIVED", occurred_at=payload.received_at,
        temperature_c=payload.receipt_temperature_c, event_reference=handover.container_reference,
        metadata_json={"temperature_status": temp_state, "handover_id": str(handover.id)},
    ))
    await append_audit_event(
        session, actor_uid=actor.uid, action="COLD_CHAIN_HANDOVER_RECEIVED",
        resource_type="cold_chain_handover", resource_id=handover.id,
        metadata={"temperature_status": temp_state},
    )
    await session.commit()
    return {"handover_id": str(handover.id), "status": handover.status, "temperature_status": temp_state}
