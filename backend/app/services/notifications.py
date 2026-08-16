"""Transactional-outbox publisher for Firestore/FCM.

Run from a scheduled worker or protected internal job. Database transactions create outbox rows;
this publisher performs external side effects later, preventing alerts from being lost when
Firestore is unavailable. Payloads carry operational IDs and coarse state only—never patient
names, phone numbers, coordinates, or clinical documents.
"""
import asyncio
from datetime import UTC, datetime
from uuid import UUID

from firebase_admin import firestore
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import firebase_app
from app.models.entities import BloodRequest, DonorProfile, NotificationOutbox, User


async def _recipient_uid(session: AsyncSession, topic: str) -> str | None:
    parts = topic.split(":")
    if parts[0] == "donor" and len(parts) >= 2:
        donor_id = UUID(parts[1])
        return await session.scalar(
            select(User.firebase_uid)
            .join(DonorProfile, DonorProfile.user_id == User.id)
            .where(DonorProfile.id == donor_id)
        )
    if parts[0] == "hospital" and len(parts) >= 2:
        return await session.scalar(select(User.firebase_uid).where(User.id == UUID(parts[1])))
    if parts[0] == "request" and len(parts) >= 2:
        return await session.scalar(
            select(User.firebase_uid)
            .join(BloodRequest, BloodRequest.hospital_user_id == User.id)
            .where(BloodRequest.id == UUID(parts[1]))
        )
    return None


async def publish_outbox_batch(session: AsyncSession, limit: int = 50) -> int:
    events = list(
        (
            await session.scalars(
                select(NotificationOutbox)
                .where(
                    NotificationOutbox.published_at.is_(None),
                    NotificationOutbox.available_at <= datetime.now(UTC),
                )
                .order_by(NotificationOutbox.available_at)
                .with_for_update(skip_locked=True)
                .limit(limit)
            )
        ).all()
    )
    if not events:
        return 0

    client = firestore.client(app=firebase_app())
    for event in events:
        recipient_uid = await _recipient_uid(session, event.topic)
        collection = "operational_events" if recipient_uid else "server_events"
        document = {
            "eventType": event.event_type,
            "payload": event.payload_json,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
        if recipient_uid:
            document["recipientUid"] = recipient_uid
        # Firebase Admin's Python client is synchronous; keep blocking I/O off the event loop.
        await asyncio.to_thread(
            client.collection(collection).document(str(event.id)).set,
            document,
        )
        event.published_at = datetime.now(UTC)
        event.attempts += 1
    await session.commit()
    return len(events)
