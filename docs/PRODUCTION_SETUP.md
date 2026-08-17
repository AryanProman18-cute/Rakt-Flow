# RaktFlow functional deployment setup

The earlier Vercel ZIP was a prebuilt visual demo. A functional deployment must build the frontend with Firebase/API environment variables and run the FastAPI service against PostgreSQL.

## Required services

- **Vercel:** frontend PWA
- **Firebase Authentication:** email/password with one-time email verification, password reset, Google sign-in, and custom role claims
- **Neon PostgreSQL:** authoritative operational records
- **Render:** FastAPI container
- **Resend:** staff invitation email delivery

Do not send service-account JSON, API tokens, database passwords, or encryption keys through chat.

## 1. Put the full project in GitHub

Upload the full `raktflow/` source tree—not the old static `vercel-deploy` folder—to a private GitHub repository.

## 2. Firebase Authentication

1. Create/open the Firebase project.
2. Project settings → General → add a **Web app**.
3. Copy the public web values: API key, auth domain, project ID, app ID.
4. Authentication → Sign-in method:
   - open **Email/Password**;
   - enable **Email/Password** and save;
   - keep **Email link (passwordless sign-in)** enabled only during the short transition for links issued by the older release, then disable it;
   - enable **Google**, select a support email, and save;
   - do not enable SMS.
5. Authentication → Templates:
   - review the **Email address verification** and **Password reset** sender name, subject, and content;
   - ensure both templates lead users back to the production RaktFlow domain.
5. Authentication → Settings → Authorized domains:
   - add the final `*.vercel.app` domain;
   - add the custom domain later if used.
6. Project settings → Service accounts → generate a private key for the backend only. Store its one-line JSON value as Render secret `FIREBASE_CREDENTIALS_JSON`. Never add it to Vercel or Git.

## 3. Neon PostgreSQL

1. Create a Neon project/database.
2. Open Neon's SQL editor and run, in order:
   - `migrations/001_initial.sql`
   - `migrations/002_identity_rbac_intake.sql`
   - `migrations/003_operational_hospitals_inventory_proposals.sql`
3. Copy the **pooled** PostgreSQL connection string.
4. Change its scheme for the API to `postgresql+asyncpg://` if necessary.
5. Store it as Render secret `DATABASE_URL`.

## 4. Generate privacy secrets

Run locally:

```bash
python -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Use the results respectively for:

- `PII_ENCRYPTION_KEY`
- `PHONE_HASH_PEPPER`
- `TOKEN_SIGNING_SECRET`

Changing the encryption key after data is stored requires a key-rotation migration.

## 5. Resend email

1. Create a Resend account.
2. Verify a sender domain.
3. Create an API key.
4. Store it in Render as `RESEND_API_KEY`.
5. Set `EMAIL_FROM` to a verified address, such as `RaktFlow <access@yourdomain.in>`.

Without Resend, invitations are recorded but production email delivery remains unavailable.

## 6. Deploy the FastAPI backend to Render

Create a Render Blueprint from the GitHub repository using `render.yaml`, or create a Docker Web Service with:

- root/repository: full project
- Docker context: `backend`
- Dockerfile: `backend/Dockerfile`
- health endpoint: `/api/v1/health`

Required Render variables:

```text
APP_ENV=production
DATABASE_URL=<Neon pooled async URL>
FIREBASE_PROJECT_ID=<Firebase project ID>
FIREBASE_CREDENTIALS_JSON=<one-line service account JSON>
TOKEN_SIGNING_SECRET=<generated secret>
PII_ENCRYPTION_KEY=<generated base64 key>
PHONE_HASH_PEPPER=<generated secret>
BOOTSTRAP_ADMIN_EMAIL=<your exact verified email>
PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
CORS_ORIGINS=["https://your-vercel-domain.vercel.app"]
RESEND_API_KEY=<Resend key>
EMAIL_FROM=RaktFlow <access@yourdomain.in>
MAX_DB_CONNECTIONS=5
```

Verify:

```text
https://your-render-service.onrender.com/api/v1/health
```

## 7. Deploy frontend source to Vercel

1. Vercel → Add New → Project → import the GitHub repository.
2. Leave **Root Directory blank** when deploying this repository. The root `package.json` and `vercel.json` build and publish `frontend/dist`.
3. Framework preset: Vite (the committed root configuration remains authoritative).
4. Add environment variables:

```text
VITE_API_BASE_URL=https://your-render-service.onrender.com
VITE_FIREBASE_API_KEY=<Firebase public web API key>
VITE_FIREBASE_AUTH_DOMAIN=raktflow-demo123.vercel.app  # same-origin proxy; hostname only
VITE_FIREBASE_PROJECT_ID=<project ID>
VITE_FIREBASE_APP_ID=<Firebase web app ID>
```

5. Deploy.
6. Put the final Vercel URL back into Firebase Authorized Domains and Render `PUBLIC_APP_URL`/`CORS_ORIGINS`, then redeploy both.

## 8. Bootstrap the Super Admin

1. Sign into the live website using the exact email in `BOOTSTRAP_ADMIN_EMAIL`.
2. The `/auth/bootstrap` API grants that email:
   - Super Admin
   - Donor
   - Organizer
   - Hospital
   - Host Venue
3. The frontend forces a Firebase token refresh and displays every workspace.
4. Open **Super Admin → Access control** and invite staff emails with only the needed roles.

Donors who sign in without an invitation receive only `ROLE_DONOR`. Staff roles are never chosen by the browser.

## 9. Operational flows

### Donor and drive

1. Donor signs in with verified email and receives only Donor access by default.
2. Donor completes the encrypted profile and preliminary screening.
3. Organizer creates a drive; it remains `PLANNED` until the Super Admin approves it, or a host approves a persisted proposal and creates an `APPROVED` drive.
4. Donor generates a signed rotating QR pass.
5. The owning organizer scans the pass or enters the donor reference manually.
6. The backend creates an audited `PENDING_REVIEW` check-in. Organizer input cannot assert clinical clearance.
7. Authorized clinical staff records `CLEARED` or `DEFERRED` with encrypted measurements.
8. Only a cleared check-in can produce a donation record and unit reference.
9. Drive turnout, clearance, collection, volume, and target completion metrics come from these records.

### Hospital and demand

1. A verified-email user submits a hospital application with registration, institutional contact, address, and facility coordinates.
2. The Super Admin reviews the application. Only `VERIFIED` facilities receive Hospital access and publishing capability.
3. Hospital staff record blood-component receipts, issues, discards, and adjustments. Balances and event history are authoritative PostgreSQL records.
4. A hospital uploads a signed PDF/JPEG/PNG requisition. It is encrypted in PostgreSQL and linked by a digest-checked opaque key.
5. The request starts `PENDING`. Explicit physician-registration and component checks are required before it becomes `VERIFIED` and donor-visible.
6. Rare needs use a controlled phenotype code; arbitrary “rare group” labels are rejected.
7. The requesting facility resolves the demand after receipt, which revokes donor-facing active state.

### Donor discovery and alerts

- Approved drives and verified RaktFlow facilities are linked to OpenStreetMap; no Google billing key is required.
- Donor screens refresh verified, unexpired public requests while the app is open and can use privacy-safe browser notifications.
- National resources include ERSS 112, Indian Red Cross contacts, and e-RaktKosh.
- The UI supports English, Hindi, Telugu, Bengali, Marathi, Tamil, Kannada, and Malayalam.

## Non-negotiable production gates

Before collecting real data: privacy/legal review, blood-bank-approved questionnaire and SOP, malware scanning for uploaded requisitions, authorization and tenant-isolation tests, penetration testing, backups/restore testing, monitoring, staff training, key-rotation procedures, and a non-free-tier emergency reliability plan. PostgreSQL document encryption protects storage but does not replace malware scanning or retention policy.
