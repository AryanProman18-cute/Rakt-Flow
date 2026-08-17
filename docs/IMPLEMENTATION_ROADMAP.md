# Implementation and release roadmap

## Current baseline

| Area | Status |
|---|---|
| Multi-role responsive experience | Working interactive prototype |
| Production frontend build | Passing |
| Workbox precache/background sync | Implemented scaffold |
| Firebase email/password, verification, recovery, and Google adapters | Implemented and wired to the V3.1 sign-in/registration interface |
| FastAPI route and ORM scaffold | Implemented |
| PostgreSQL/PostGIS initial migration | Implemented |
| Rare-grid and platelet pure logic | Implemented; unit-tested |
| Request, PPH, and outbox state guards | Implemented scaffold |
| Private production document storage | Deliberately blocked pending adapter |
| Real hospital inventory integration | Not implemented |
| Real push delivery and outbox runner | Publisher implemented; worker deployment pending |
| Clinical, legal, security certification | Not started |

## Phase 0 — governance and validation (2–4 weeks)

**Goal:** decide whether, where, and under whose authority the pilot may operate.

- Name a clinical safety owner, blood-bank operations owner, privacy owner, and incident commander.
- Validate workflows with donors, phlebotomists, obstetric teams, blood-bank medical officers, couriers, organizers, and venue teams.
- Define compatibility and emergency-release boundaries as external clinical SOPs.
- Complete data inventory, retention, consent, accessibility, and jurisdictional review.
- Revalidate every vendor's current free-tier limits and terms; remove the “zero cost” promise if any required control is unavailable.
- Define fallback operations when the app, internet, push, or maps are unavailable.

**Exit:** approved hazard log, data-flow map, pilot scope, and no-real-data rule lifted by accountable owners.

## Phase 1 — identity, tenancy, and core platform (3–5 weeks)

- Validate email/password registration, verification, recovery, Google sign-in, and backend bootstrap in supported browsers.
- Build invite/provisioning and offboarding for organizations and staff.
- Replace broad roles with permission claims and server-side resource membership.
- Add hospital, organizer, and venue tenant tables and membership constraints.
- Configure Firebase token revocation, session-age checks, and audited step-up for PPH/reviewer actions.
- Deploy Neon migration through a reviewed migration pipeline.
- Implement a private object-store adapter and malware scanning.
- Add managed secrets and separate dev/staging/production projects.

**Exit:** cross-tenant authorization tests pass; production refuses dev auth/local storage.

## Phase 2 — verified request lifecycle (3–4 weeks)

- Implement upload pre-signing/streaming, digest checks, retention, and reviewer document viewer.
- Add reason-code catalog and separation between request author and reviewer.
- Build OCR as non-authoritative data entry assistance with confidence display.
- Add expiry scheduler and outbox worker with retry/dead-letter behavior.
- Add donor response and alert-withdrawal acknowledgment endpoints.
- Test status transitions, races, duplicate receiving events, and clock skew.

**Exit:** no alert can be emitted before authorization; stale and resolved alerts are withdrawn within the defined SLO.

## Phase 3 — drive operations and offline integrity (3–4 weeks)

- Bind rotating donor pass to user, device/session, screening, and drive.
- Implement a signed offline verification envelope and replay nonce store.
- Encrypt IndexedDB queue fields, enforce 24-hour TTL, and add shared-device purge.
- Add scanner camera permission UX and tested manual fallback.
- Implement collection unit labeling, reconciliation, and queued PDF certificates.
- Conduct basement/rural connectivity field simulation with clock changes and repeated scans.

**Exit:** no lost or duplicate check-in across tested outage cases; offline security review passes.

## Phase 4 — specialized logistics pilots (4–6 weeks)

### Rare grid

- Add phenotype terminology governance; do not model Bombay phenotype as an ordinary ABO value in mature schema.
- Introduce fairness constraints, donor quiet hours, notification rate limits, cooldowns, and decline privacy.
- Run synthetic spatial and load tests, including zero-result and dense-result cases.

### Platelets

- Integrate verified apheresis assessments and blood-bank inventory events.
- Model donation/recovery policy as versioned rules, not hardcoded universal medical truth.
- Add cancellation/backfill and wastage analytics.

### PPH bridge

- Add blood-bank acknowledgment, courier credentialing, location telemetry TTL, escalation timers, and fallback contacts.
- Run tabletop exercises with maternity and blood-bank teams.
- Ensure the system never presents an ETA as a clinical guarantee.

**Exit:** each module has a signed SOP, test evidence, fallback plan, and owner.

## Phase 5 — production reliability (4+ weeks)

- Move emergency API and workers to always-on paid compute with measured autoscaling.
- Add database backup/PITR, restore drills, connection observability, and regional recovery plan.
- Add WAF/rate limiting, dependency/SAST scans, external penetration test, and privacy audit.
- Establish metrics: request verification time, alert precision, donor response, withdrawal latency, unit delivery, offline replay age, outbox lag, false-alert rate, and accessibility defects.
- Load test drive bursts and emergency fanout using synthetic data.
- Train support staff and launch a narrow, monitored pilot with explicit kill switch.

## Recommended first vertical slice

Implement one complete, measurable path before expanding all dashboards:

1. organizer creates an approved drive;
2. donor authenticates, books, completes a non-clinical pre-screen, and receives a signed pass;
3. organizer checks donor in online and offline;
4. clinical staff records collection;
5. reconciliation generates a certificate;
6. host venue sees only aggregated turnout.

This slice validates identity, consent, offline sync, audit, tenancy, and privacy without beginning with the highest-risk emergency workflow.

## Definition of done for every feature

- written user story and hazard analysis;
- resource-level authorization and negative tests;
- idempotent mutation and audited state transition;
- no prohibited data in logs, URLs, Firestore, analytics, or local storage;
- loading, empty, error, offline, expired, revoked, and reduced-motion states;
- keyboard and screen-reader checks;
- migration, rollback, monitoring, runbook, and named owner;
- clinical review when the feature touches eligibility, compatibility, components, or emergency release.
