# RaktFlow V3.2

**Verified blood-donation coordination and accountable blood logistics for India.**

RaktFlow is a responsive PWA connecting five controlled workspaces: Donor, Organizer, Hospital/Blood Bank, Host Venue, and Super Admin. V3.2 preserves the preferred V3 interface while connecting visible workflows to Firebase Authentication, FastAPI, PostgreSQL/PostGIS, and Resend.

> RaktFlow is not a blood bank, emergency service, compatibility test, clinical decision system, or medical clearance. Qualified professionals remain responsible for donor eligibility, collection-time testing, blood safety, compatibility, release, transport, and transfusion. Free-tier hosting does not provide a mission-critical SLA.

## V3.2 capabilities

- Verified-email donor registration with Donor-only access by default
- Invitation-only, multi-role staff authorization controlled by Super Admin
- Actionable sign-in/bootstrap errors and a polished post-login loader
- Complete static authenticated UI catalogs for English, Hindi, Telugu, Bengali, Marathi, Tamil, Kannada, and Malayalam
- Real donor profile creation/editing with blood group and protected location
- Nearby-only drives, verified facilities, and verified needs within a 100 km query radius
- Embedded fallback map plus a progressive Mappls SDK adapter; no map key is committed
- Private pre-check, authorized Hospital-role review, and latest-screening enforcement
- Opaque rotating signed donor QR with camera, uploaded-image, and audited manual intake
- Separate on-site clinical clearance before collection recording
- Persisted direct drives, hosted-drive proposals, approvals, donor registration, roster, check-in, units, and reconciliation
- Persisted facility applications, encrypted licence/registration evidence, Super Admin review, and application email notification
- Verified-facility inventory and protected blood-request workflows
- Persisted campaign slugs, posters, registration links/QR, sharing, hashed visits, registrations, and conversion analytics
- Global Super Admin summaries, users, roles, invitations, hospitals, drives, campaigns, operations, and audit records
- Responsive V3 dashboards, mobile bottom navigation, dark theme, keyboard focus, reduced-motion support, and Apple/system typography

Normal authenticated operation contains no demo mode or seeded display totals.

## Architecture

| Service | Responsibility |
|---|---|
| Vercel | Vite PWA frontend in `frontend/` |
| Render | Dockerized Python FastAPI backend in `backend/` |
| Neon | Existing PostgreSQL + PostGIS operational records |
| Firebase Authentication | Identity and verified email only |
| Resend | Invitations, campaign sharing, and facility notifications |
| GitHub | Source and deployment workflow |

Firebase does not replace the operational backend. Authorization, workflow state, evidence, inventory, registrations, and audit records live in PostgreSQL.

## Repository map

```text
frontend/                       Vite PWA, V3 interface, scanner, eight locales
backend/app/api/routes/         FastAPI routes for all operational workflows
backend/app/models/             SQLAlchemy/PostGIS entities
backend/app/services/           privacy, tokens, email, safety, audit, roles
backend/tests/                  deterministic unit and workflow-safety tests
migrations/001_initial.sql
migrations/002_identity_rbac_intake.sql
migrations/003_operational_hospitals_inventory_proposals.sql
migrations/004_integrated_workflows.sql
docs/                           architecture, security, deployment, changelogs
render.yaml                     Render blueprint
vercel.json                     Vercel build and security headers
```

## Local frontend

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

Set the public Firebase web configuration and FastAPI origin in `.env.local`. Do not put a Firebase service-account file or server secret in the frontend.

Checks:

```bash
npm run lint
npm test
npm run build
```

## Local backend

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Use a development database and non-production Firebase project. Production rejects development header authentication.

Checks:

```bash
ruff check app tests
pytest -q
```

## Database migrations

New databases apply migrations 001, 002, 003, and 004 in order. Existing V3 production databases apply only `migrations/004_integrated_workflows.sql` for this release. Migration 004 is additive and is designed to preserve existing Neon records.

## Security and privacy boundaries

- The browser cannot grant itself a staff role.
- Invitation acceptance requires the exact Firebase-verified invited email.
- QR payloads contain an opaque signed token rather than donor identity or health details.
- Phone, questionnaire, measurement, requisition, and facility-evidence data are encrypted at rest.
- Campaign visitor identifiers are one-way keyed hashes; IP addresses are not stored for analytics.
- Public needs omit patient identity and are published only after verified-facility clinical checks.
- Self-reported blood group is not treated as laboratory proof; collection-time testing remains mandatory.
- Do not copy or scrape third-party donor directories without authorized API access.

## Deployment

For an existing deployment, start with [`APPLY_V3_2_UPDATE.md`](APPLY_V3_2_UPDATE.md). Do not recreate Firebase, Neon, Render, Vercel, or GitHub, and do not reset the production database.

## Documentation

- [V3.2 deployment reference](docs/DEPLOYMENT_V3_2.md)
- [V3.2 changelog](docs/CHANGELOG_V3_2.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security and clinical safety](docs/SECURITY.md)
- [API contract](docs/API.md)
- [Specification traceability](docs/SPEC_TRACEABILITY.md)

Contact: `chemnaam@gmail.com` · `+91 9908840322`

<!-- Trigger Vercel V3.2 production deployment: 2026-08-18 -->
