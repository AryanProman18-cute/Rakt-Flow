import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AuditEvent


async def append_audit_event(
    session: AsyncSession,
    *,
    actor_uid: str,
    action: str,
    resource_type: str,
    resource_id: UUID | None,
    metadata: dict | None = None,
) -> AuditEvent:
    previous = await session.scalar(select(AuditEvent).order_by(AuditEvent.occurred_at.desc()).limit(1))
    previous_hash = previous.event_hash if previous else None
    occurred_at = datetime.now(UTC)
    canonical = json.dumps(
        {
            "actor": actor_uid,
            "action": action,
            "resource_type": resource_type,
            "resource_id": str(resource_id) if resource_id else None,
            "metadata": metadata or {},
            "occurred_at": occurred_at.isoformat(),
            "previous_hash": previous_hash.hex() if previous_hash else None,
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    event = AuditEvent(
        occurred_at=occurred_at,
        actor_uid=actor_uid,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata_json=metadata or {},
        previous_hash=previous_hash,
        event_hash=hashlib.sha256(canonical).digest(),
    )
    session.add(event)
    return event
