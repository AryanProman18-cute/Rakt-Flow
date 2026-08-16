# RaktFlow API contract

Base path: `/api/v1`  
Authentication: `Authorization: Bearer <Firebase ID token>`  
Content type: `application/json`, except document upload (`multipart/form-data`)

The API derives role and identity from verified Firebase custom claims and verifies an active PostgreSQL user. Client-supplied role headers are rejected except when `ALLOW_DEV_AUTH=true` in a non-production environment.

## Common behavior

| Code | Meaning |
|---|---|
| `200/201/204` | Successful operation |
| `401` | Missing, invalid, expired, or revoked identity token |
| `403` | Valid identity lacks provisioned role/resource access |
| `404` | Resource does not exist or is not visible to actor |
| `409` | State transition or idempotency precondition failed |
| `413/415` | Upload too large or unsupported format |
| `422` | Structurally valid request failed a business precondition |

No API response should contain raw phone numbers, patient names, donor health answers, or permanent document URLs.

## Identity, roles, and donor onboarding

### `POST /auth/bootstrap`

Accepts a verified Firebase identity. A matching pending invitation applies its roles; an uninvited identity defaults to `ROLE_DONOR`; the configured bootstrap-admin email receives all roles. The endpoint writes database grants, updates Firebase custom claims, and tells the client to refresh its token.

### `GET/PUT /donors/me/profile`

Stores full name, date of birth, city, known blood type, consent, and protected phone metadata. Phone plaintext is envelope-encrypted; search uses a keyed HMAC. The QR never embeds these values.

### `POST /donors/me/screenings`

Stores an encrypted `IN-PRECHECK-2026-01` self-attestation and returns `PROCEED_TO_CLINICAL`, `CLINICAL_REVIEW`, or `TEMPORARY_DEFERRAL_SUGGESTED`. None means clinical clearance.

### Administration

- `GET /admin/users`
- `GET/POST /admin/invitations`
- `PUT /admin/users/{id}/roles`
- `PATCH /admin/users/{id}/status`

All require `ROLE_SUPER_ADMIN`. Role changes update database grants and Firebase claims. Staff invitations can be delivered through Resend.

### Drive and intake core

- `GET /drives/public`
- `GET /drives/mine`
- `POST /drives`
- `PATCH /drives/{id}`
- `PATCH /drives/{id}/status`
- `GET /drives/{id}/analytics`
- `POST /drives/proposals`
- `GET /drives/proposals/mine`
- `POST /drives/proposals/{id}/decision`
- `POST /intake/scan`
- `POST /intake/manual`
- `POST /intake/{checkin_id}/assessment`
- `POST /intake/{checkin_id}/donation`

A scan validates the signed rotating pass and creates an audited `PENDING_REVIEW` check-in. Only qualified clinical roles may record `CLEARED` or `DEFERRED`; donation recording rejects any check-in not marked `CLEARED`.

## System

### `GET /health`

Liveness response. It intentionally avoids touching the database so it is cheap and distinguishes process liveness from dependency readiness.

```json
{ "status": "ok", "service": "raktflow-api", "version": "0.1.0" }
```

### `HEAD /health` and `HEAD /ping`

No-content bounded warm-up endpoints. They do not authenticate or disclose dependency state.

## Donor

### `GET /donors/me/pass`

Role: `ROLE_DONOR`

Requires an active donor profile and current screening. Returns a signed 30-second pass token and six-digit rotating code.

```json
{
  "token": "eyJ...",
  "rotating_code": "482109",
  "expires_at": "2026-08-16T10:00:30Z",
  "offline_valid_until": "2026-08-16T22:00:01Z"
}
```

The server must validate token signature, purpose, donor ID, screening status, expiry, and device/session binding at intake. The `offline_valid_until` value does not make an expired rotating QR valid; it bounds a separately signed offline verification envelope to be implemented during hardening.

## Drive intake

### `POST /checkins`

Role: `ROLE_ORGANIZER`

```json
{
  "idempotency_key": "0191e7fa-61dc-7ab0-a626-c146f5aa1200",
  "drive_id": "3b80c9fc-943c-4b42-846c-62ae88eb92e9",
  "donor_id": "eaf5bf5d-36dd-4e53-8a3d-5ff5c6a2a947",
  "scanned_at": "2026-08-18T04:12:33Z",
  "clearance_status": "PENDING_REVIEW"
}
```

### `POST /checkins/batch`

Role: `ROLE_ORGANIZER`  
Limit: 250 records

```json
{ "items": [/* CheckInCreate */] }
```

Response:

```json
{ "accepted": 18, "duplicates": 2 }
```

The database unique constraint on `idempotency_key` makes online retries and offline replay safe. Batch items must belong to an approved drive owned by the organizer, and their only accepted clearance value is `PENDING_REVIEW`.

## Operational hospitals, public discovery, and donor records

### Hospital lifecycle and inventory

- `POST /hospitals/applications` — any verified-email account may apply once.
- `GET /hospitals/me` — application/verification state for the caller.
- `GET /hospitals/applications` — Super Admin review queue.
- `POST /hospitals/{id}/verification` — Super Admin verifies, rejects, or suspends; role grants and Firebase claims are synchronized.
- `GET /hospitals/inventory/me` — balances for the verified facility.
- `POST /hospitals/inventory/events` — audited receipt, issue, discard, or directed adjustment.
- `GET /hospitals/inventory/events` — capped facility event history.

Inventory is separated by ABO/Rh group, component, and confirmed phenotype code. A balance cannot fall below zero or reserved units.

### Public and donor operations

- `GET /public/requests` — verified, unexpired needs with requesting verified facility; no patient reference or document.
- `GET /public/centres` — verified RaktFlow facility coordinates for OpenStreetMap.
- `GET /donors/me/donations` — caller's clinically cleared collection history.
- `GET /donors/me/alerts` — caller's targeted verified alerts.
- `POST /donors/me/alerts/{id}/response` — accept/decline within the response deadline.
- `GET /notifications/config` and `POST /notifications/subscriptions` — privacy-protected browser subscription registration.

## Request verification

### `POST /requests/documents`

Role: `ROLE_HOSPITAL`  
Input: one `upload` field; PDF/JPEG/PNG; maximum 10 MB by default.

The verified facility's document is envelope-encrypted and durably stored in PostgreSQL with an opaque key, SHA-256 digest, content type, size, and owner. Request creation rejects a key/digest not owned by the caller. Production operations must still add malware scanning, retention deletion, access review, and region/compliance controls; a private object store is recommended if volume grows.

### `POST /requests`

Role: `ROLE_HOSPITAL`; the caller must also own a `VERIFIED` hospital profile.

```json
{
  "patient_reference": "MRN-427199",
  "blood_type": "O-",
  "phenotype_code": "RH_NULL",
  "component_type": "PRBC",
  "units_needed": 2,
  "urgency": "RARE_STANDBY",
  "expires_in_hours": 8,
  "latitude": 17.6868,
  "longitude": 83.2185,
  "document_object_key": "private/opaque-key.pdf",
  "document_sha256_hex": "<64 hexadecimal characters>"
}
```

Patient reference is immediately transformed with a keyed HMAC before persistence; responses never return it. Rotating the keyed-hash pepper requires a governed migration.

### `POST /requests/{id}/verify`

Role: `ROLE_HOSPITAL`. The request must belong to the caller's verified facility (Super Admin may intervene). Add a finer clinical-reviewer claim as part of clinical-governance hardening.

```json
{
  "decision": "VERIFIED",
  "reason_code": "SIGNED_REQUISITION_MATCH",
  "physician_registration_confirmed": true,
  "component_confirmed": true
}
```

Only `PENDING` requests can be reviewed. `VERIFIED` requires both explicit confirmations. Approval creates the status transition, audit event, and notification-outbox row in one transaction.

### `POST /requests/{id}/resolve`

Role: `ROLE_HOSPITAL`; only the requesting facility (or Super Admin) can resolve the demand.

```json
{
  "receiving_event_id": "RECV-DGH-20260816-0041",
  "units_received": 2
}
```

Only a `VERIFIED` request can resolve. Resolution creates a revocation event so clients remove the active call.

## Specialized logistics

### `POST /logistics/rare/dispatch`

Role: `ROLE_HOSPITAL`

```json
{
  "request_id": "0f39b786-d814-49f6-80ea-121126821c72",
  "initial_radius_km": 15,
  "cohort_size": 5
}
```

Preconditions: `VERIFIED`, `RARE_STANDBY`, no existing dispatch. Candidate selection uses `ST_DWithin` and `ST_Distance`, an active eligibility window, opt-in state, exact requested phenotype, and nearest-first ordering.

### `POST /logistics/rare/{request_id}/expand`

Role: `ROLE_HOSPITAL` or trusted scheduler in the eventual worker design.

Expands once to 30 km only when the first 10-minute deadline has passed and fewer than two donors accepted.

### `POST /logistics/platelets/schedule`

Roles: `ROLE_HOSPITAL`, `ROLE_ORGANIZER`

Accepts candidate donor IDs, last apheresis time, vein-suitability assessment, and availability days (`0..2`). Returns balanced A/B/C windows. The endpoint enforces the 14-day recovery interval but does not clinically clear a donor.

### `POST /logistics/pph`

Role: `ROLE_HOSPITAL`

```json
{
  "request_id": "e334ac3c-54b2-49af-a75a-af91701574ab",
  "ward": "Maternity Ward / DR-2",
  "clinical_owner_registration": "OBG-4421",
  "authorization_confirmed": true
}
```

Preconditions: `VERIFIED`, `CRITICAL_PPH`, no existing PPH dispatch, explicit authorization confirmation. Returns dispatch ID and two-hour target arrival.

## Remaining production hardening

The operational core is implemented, but these items still require governed implementation:

- donor ETA sharing and explicit alert-withdrawal acknowledgments
- lot-level component expiry and reservation/release workflows
- courier assignment and rate-limited location telemetry
- certificate generation through a queued worker
- push delivery worker, subscription revocation, dead-letter recovery, and scheduled request expiry
- fine-grained reviewer, phlebotomy, maternity, and medical-director permissions
- requisition malware scanning, retention deletion, and key-rotation tooling

## API acceptance rules

- All mutation endpoints accept or generate idempotency keys.
- All state transitions lock the authoritative row.
- External notifications are triggered only through an outbox committed with the mutation.
- Spatial queries use geography columns and GiST indexes.
- List endpoints must be paginated and capped before implementation.
- Logs must use IDs and reason codes, never document contents or patient/donor secrets.
