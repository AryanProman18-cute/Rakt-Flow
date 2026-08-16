# RaktFlow

**Verified blood donation and emergency logistics—designed to reduce alert noise and move the right response in time.**

RaktFlow is a responsive, multi-party PWA for donors, organizing bodies, hospitals/blood banks, and host venues. This repository turns the supplied 14-page product specification into an API-backed operational pilot with authenticated, role-owned workflows and a production-oriented deployment architecture.

> **Important:** This is a pre-production engineering baseline, not a certified medical device or a deployed clinical service. Blood compatibility, donor eligibility, emergency-release decisions, document verification, and transfusion remain under qualified clinical authority. A free-tier deployment cannot provide a mission-critical SLA.

## Functional v2 upgrade

The project now starts with a polished public landing page and includes a connected production core:

- Firebase passwordless email and Google authentication adapters
- donor self-registration after verified email
- Super Admin bootstrap by configured email
- invitation-only staff access and multiple roles per email
- admin user, invitation, activation, and role-management APIs
- encrypted donor phone/profile data and India-focused preliminary screening
- signed rotating QR passes containing opaque identifiers only
- authenticated QR and manual organizer check-in
- mandatory clinical assessment before a donation can be recorded
- auditable donation records linked to donor, drive, time, blood group, and unit reference
- organizer-owned drive creation/editing, Super Admin approval, persisted venue proposals, and real turnout/collection analytics
- Super Admin-verified hospital applications, audited component inventory, encrypted requisitions, and request resolution
- verified-facility public demands, controlled rare-phenotype codes, donor alert responses, and donation history
- OpenStreetMap centre/drive discovery and official India-national helplines/resources
- English, Hindi, Telugu, Bengali, Marathi, Tamil, Kannada, and Malayalam UI support
- public operational statistics, Resend invitation email integration, and PostgreSQL migrations 001–003

See [Functional production setup](docs/PRODUCTION_SETUP.md). Credentials and regulated-data controls must be configured before real use.

## What is included

- **Five controlled portal experiences** with role switching:
  - Donor discovery, targeted emergency response, health pre-screening, apheresis standby, and rotating QR pass
  - Organizer drive command center, QR intake, offline-safe check-ins, reconciliation, and certificates
  - Hospital inventory, expiring verified requests, rare-donor pager, platelet scheduling, and protected PPH dispatch
  - Venue proposals, logistics readiness, campaign assets, and privacy-preserving ESG analytics
  - Super Admin email invitations, account status, and multi-role permission control
- **Responsive, accessible UI:** light/dark themes, keyboard focus, reduced-motion support, mobile bottom navigation, high-contrast status treatment, and semantic dialogs/tables.
- **Offline PWA:** Workbox precaching, network strategies, IndexedDB design, and background replay of idempotent check-ins.
- **FastAPI backend:** Firebase JWT verification, role-based authorization, bounded Neon connection pool, audit events, transactional notification outbox, spatial dispatch, and state-transition guards.
- **PostgreSQL/PostGIS migration:** constraints, GiST and partial indexes, request expiry, idempotency, and append-only audit protection.
- **Firebase/Render scaffolding:** Hosting headers, restrictive Firestore rules, Docker/Render config, CI, and an optional warm-up workflow.
- **Architecture and assurance docs:** API contract, threat model, deployment gates, implementation roadmap, and an improved coding-agent prompt.

## Repository map

```text
raktflow/
├── frontend/                 Vanilla ESNext + Vite + Workbox PWA
│   ├── src/main.js           Interactive multi-role prototype
│   ├── src/sw.js             Offline/runtime caching + background sync
│   ├── src/auth.js           Firebase magic-link and Google auth adapter
│   ├── src/api.js            Authenticated API client
│   └── src/realtime.js       Recipient-scoped Firestore listener
├── backend/                  FastAPI + SQLAlchemy async API
│   ├── app/api/routes/       Donors, check-ins, requests, logistics
│   ├── app/models/           PostgreSQL/PostGIS ORM entities
│   ├── app/services/         Tokens, rare grid, platelet, audit, outbox
│   └── tests/                Deterministic logistics unit tests
├── migrations/001_initial.sql
├── migrations/002_identity_rbac_intake.sql
├── migrations/003_operational_hospitals_inventory_proposals.sql
├── firestore/                Rules and indexes
├── docs/                     Architecture, API, security, roadmap, prompt
├── firebase.json
└── render.yaml
```

## Run the visual prototype

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL. The unauthenticated **Explore demo** path is clearly separated from real records. Authenticated workspaces are shown only for roles granted by server-side Firebase claims; operational forms read and write through FastAPI/PostgreSQL.

Production build:

```bash
npm run build
npm run preview
```

## Run the API locally

Prerequisites: Python 3.12+, PostgreSQL 16+ with PostGIS, and a Firebase project.

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Edit .env; development header auth is opt-in and forbidden in production.
psql "$DATABASE_URL_SYNC" -f ../migrations/001_initial.sql
psql "$DATABASE_URL_SYNC" -f ../migrations/002_identity_rbac_intake.sql
psql "$DATABASE_URL_SYNC" -f ../migrations/003_operational_hospitals_inventory_proposals.sql
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs are available at `http://localhost:8000/api/docs` only outside production.

Tests and checks:

```bash
python -m ruff check app tests
python -m pytest -q
```

## Authentication model

- Donors: Firebase verified email magic link or Google sign-in, with only Donor access by default.
- Organizer and host-venue staff: verified identity plus Super Admin invitation and Firebase custom role claims.
- Hospitals: a verified-email user may apply, but Hospital access and demand publishing remain blocked until Super Admin facility verification.
- The frontend never chooses its own authorization role. The API trusts only verified custom claims and its PostgreSQL user record.
- SMS authentication is intentionally absent.
- WebAuthn/passkeys are **not represented as available in the free Firebase baseline**. If required for clinical step-up, add a separately reviewed WebAuthn/Identity Platform integration rather than simulating it.

## Data boundaries

| Store | Appropriate data | Prohibited data |
|---|---|---|
| Neon PostgreSQL | Transactional IDs, donor operational profile, requests, inventory, encrypted requisition bytes, consent state, dispatch and audit metadata | Raw passwords, plaintext phone numbers, public document URLs |
| Optional private object store | Future high-volume encrypted document storage with short-lived access | Publicly readable slips |
| Firestore | Recipient-scoped, short-lived operational event projections | Patient identity, documents, detailed clinical records, donor location history |
| IndexedDB | Device-bound pass cache and pending drive check-ins | Requisition documents, broad donor exports, long-lived PHI |

## Deployment warning

The supplied specification targets zero baseline cost. Free tiers are useful for pilots and demonstrations, but autosuspension, quotas, schedule jitter, and terms can change. The optional warm-up workflow is disabled until `RENDER_HEALTH_URL` is configured and must only be used if current hosting terms permit it. Do not promise emergency availability until load tests, monitoring, incident response, backup/restore drills, legal review, clinical governance, and a paid reliability plan are complete.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [Security and clinical safety](docs/SECURITY.md)
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [Master coding-agent prompt](docs/MASTER_SYSTEM_PROMPT.md)
- [Source-specification traceability](docs/SPEC_TRACEABILITY.md)
