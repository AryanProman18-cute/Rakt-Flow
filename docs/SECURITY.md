# Security, privacy, and clinical-safety baseline

## Status

This repository is a design and implementation scaffold. It has not completed penetration testing, privacy impact assessment, clinical hazard analysis, regulatory review, or production readiness approval.

## 1. Safety boundaries

RaktFlow may:

- coordinate verified requests, availability, appointments, couriers, and status acknowledgments;
- rank opted-in candidates by compatibility attributes supplied by an authorized blood bank and approximate distance;
- enforce timing, expiry, deduplication, and escalation rules;
- display operational decision support.

RaktFlow must not:

- diagnose, prescribe, determine transfusion compatibility, or authorize emergency release;
- represent a self-reported screening as clinical clearance;
- infer phenotype from ordinary ABO/Rh fields;
- tell a donor to stop medication;
- send an unverified patient request to donors;
- expose patient identity, clinical documents, exact donor locations, or contact lists through Firestore or public links;
- claim that an arrival target or free-tier host guarantees emergency care.

Every high-impact action requires an authenticated named actor, explicit confirmation, current resource state, and an append-only audit event.

## 2. Threat model summary

| Threat | Primary controls | Remaining work |
|---|---|---|
| Forged donor pass / screenshot replay | 30-second signed token, rotating code, server validation | Device binding, offline signed envelope, key rotation, replay nonce store |
| Client changes its role | Firebase custom claims + PostgreSQL profile; no client role trust | Admin provisioning console, claim lifecycle test suite |
| Alert spam / stale social requests | Human authorization gate, 6–12 h expiry, resolution revocation | Reviewer separation of duties, abuse scoring |
| Donor enumeration | Opaque IDs, micro-tier server query, no public search | Rate limits, anomaly detection, honey tokens |
| Location disclosure | Server-side PostGIS; coarse distance in UI | Location retention limits, coordinate fuzzing outside active standby |
| Offline duplicate check-in | Client idempotency key + database unique constraint | Signed device enrollment and queue encryption |
| Stolen organizer device | Short token lifetime, revocation checks, least privilege | MDM/shared-device mode, local data purge, step-up auth |
| Malicious requisition file | MIME/size allowlist, private object key, digest | Malware scan, file-signature detection, image transcoding sandbox |
| API cold-start abuse / resource exhaustion | bounded pool, capped batches, short health route | Edge rate limiting, WAF, per-actor quotas, load tests |
| Firestore data leak | deny-by-default rules; recipient UID equality | Emulator rule tests and automated data-classification checks |
| Audit tampering | append-only trigger and chained event hashes | External immutable anchor, verification job, privileged DBA procedure |
| Notification inconsistency | transactional outbox | Retry/dead-letter worker, delivery receipts, alert withdrawal SLA |

## 3. Authentication and authorization

- Firebase Auth supports email/password with one-time email verification, password reset, and Google sign-in; SMS is excluded.
- A sign-in does not provision a role. A trusted administration workflow verifies organization, domain, employment/affiliation, and expiration before setting custom claims and creating the PostgreSQL user.
- Hospital accounts require narrower permissions than `ROLE_HOSPITAL`: `REQUEST_CREATE`, `REQUEST_REVIEW`, `PPH_ACTIVATE`, `INVENTORY_WRITE`, and `MEDICAL_DIRECTOR` should be separate claims or database grants before production.
- Firebase ID tokens are checked for validity and revocation. Sensitive actions should also reject old `auth_time` and require reauthentication.
- Institutional email domain is a routing signal, not proof of current employment.
- WebAuthn/passkeys require an independently reviewed step-up implementation. They are not silently claimed as part of the baseline Firebase free stack.

## 4. Data classification

| Class | Examples | Handling |
|---|---|---|
| Restricted clinical | requisition image, screening answers, medical notes | encrypted private object/column storage; narrowly authorized; never Firestore |
| Restricted identity | email, phone, patient reference, Firebase UID | minimize, tokenize/hash, access-log, retention schedule |
| Sensitive operational | location, phenotype, donor eligibility, dispatch route | server-side access, purpose-limited projections, short retention |
| Internal | inventory counts, station load, proposal status | role-scoped |
| Public | approved drive name/time, public venue, registration link | explicit publish workflow only |

Plain SHA-256 is acceptable for file integrity. For patient references and phone lookup, use keyed HMAC with a managed pepper and versioned rotation; predictable identifiers are vulnerable to dictionary attacks even when hashed.

## 5. Document storage requirements

The local file adapter is development-only. A production adapter must enforce:

1. private bucket/object ACLs and public access prevention;
2. encryption at rest and TLS in transit;
3. opaque random object keys, never patient names;
4. short-lived server-authorized download URLs or streamed access;
5. content-length, extension, MIME, and magic-byte validation;
6. malware scanning and safe image/PDF processing;
7. object digest verification;
8. read/write/delete audit trails;
9. retention, legal-hold, and deletion policies;
10. regional and contractual review appropriate to the deployment jurisdiction.

## 6. PWA and browser controls

- The Firebase Hosting configuration supplies CSP, frame denial, MIME sniff prevention, referrer policy, and permissions policy.
- Camera and geolocation are self-origin only and requested just in time.
- Service-worker queues must not store bearer tokens. Workbox replays request headers by default; production should inject a fresh token during replay or use a short-lived device credential rather than persist an expired Firebase token.
- Offline queue items need a TTL and a visible purge action on shared devices.
- Dynamic QR material must be treated as a bearer capability and never copied to analytics.
- Avoid third-party trackers on hospital, screening, pass, and emergency routes.

## 7. Logging and observability

Log:

- request ID, actor UID surrogate, route, state transition, reason code, latency, result;
- database pool saturation, outbox lag, failed notification count, queue replay age;
- dispatch acknowledgment and withdrawal timing;
- privileged document access.

Do not log:

- JWTs, email-verification/reset links, VAPID keys, Firebase credentials;
- patient reference, donor phone/email, exact coordinates;
- requisition content, screening answers, QR token, rotating code;
- full Firestore payloads.

Production needs structured redaction, centralized retention, alert thresholds, clock synchronization, and break-glass access monitoring.

## 8. Clinical hazard controls

| Hazard | Control |
|---|---|
| Wrong request component | Structured component field; reviewer confirmation; no OCR auto-approval |
| Alert remains after need is met | Receiving event transitions to `RESOLVED`; withdrawal outbox event; client expiry |
| Incompatible “universal donor” assumption | UI and API state that release/compatibility is clinically controlled; no automatic transfusion instruction |
| Donor contacted too soon | eligibility window and recovery interval; final on-site assessment |
| Platelets expire unused | three-day availability staggering; actual inventory timestamps remain blood-bank owned |
| Courier ETA mistaken for guarantee | target and telemetry labeled estimates; escalation/runbook required |
| Free-tier outage during emergency | explicit non-SLA pilot status; fallback phone/radio protocol and paid production plan required |

## 9. Pre-production gate

Do not process real patient or donor data until all are complete:

- clinical governance owner and approved SOPs;
- jurisdiction-specific legal/privacy review and data-processing agreements;
- DPIA/data inventory, consent language, retention schedule, and data-subject request procedure;
- secrets manager and key rotation;
- private durable document store and malware scanning;
- RBAC matrix and provisioning/offboarding workflow;
- Firestore emulator tests and API authorization tests;
- SAST, dependency scanning, penetration test, and remediation;
- backup/restore and audit-chain verification drills;
- load, cold-start, offline replay, and regional outage tests;
- monitoring, on-call, incident response, and clinical fallback runbooks;
- accessibility audit with keyboard, screen reader, contrast, zoom, and reduced motion;
- disaster recovery objective and paid reliability architecture approved by stakeholders.
