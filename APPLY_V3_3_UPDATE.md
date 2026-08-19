# Apply RaktFlow V3.3 safely

V3.3 is one combined editable update. It includes the earlier V3.3 fixes plus the accepted PDF-driven privacy, usability and separation-of-duty improvements.

**Do not overwrite V3.2.1 production until the copied-database rehearsal passes. Do not rerun migrations 001–004.**

## 1. Keep a rollback reference

1. Keep the current V3.2.1 ZIP and deployed Git commit unchanged.
2. Record the current Render deploy ID and Vercel deployment URL.
3. Do not delete Firebase, Neon, Render, Vercel, GitHub, users or existing data.

## 2. Rehearse migration 005 on a Neon branch

1. In Neon, create a branch from the current production branch so existing schema/data are copied.
2. Open the SQL Editor for the **new branch**, not production.
3. Paste and run only `migrations/005_trust_logistics_and_mobile.sql`.
4. Confirm it ends with `COMMIT` and reports no error.
5. Run the smoke queries in `docs/V3_3_MIGRATION_SMOKE.sql`.
6. Point a temporary Render test service at the branch URL, preserving the asyncpg-safe `?ssl=require` form.
7. Complete the five-role acceptance checklist in `docs/V3_3_ACCEPTANCE_CHECKLIST.md`.

## 3. Backend configuration

Keep all existing secrets private. Never paste them into chat or commit them.

Required production values remain:

- `APP_ENV=production`
- `DATABASE_URL=...?...ssl=require`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CREDENTIALS_JSON`
- `TOKEN_SIGNING_SECRET` (strong, unchanged unless intentionally rotating all passes)
- `PII_ENCRYPTION_KEY` (unchanged, or existing encrypted data cannot be read)
- `PHONE_HASH_PEPPER` (unchanged)
- `BOOTSTRAP_ADMIN_EMAIL`
- `PUBLIC_APP_URL=https://raktflow-demo123.vercel.app`
- `CORS_ORIGINS=https://raktflow-demo123.vercel.app`
- `ADMIN_NOTIFICATION_EMAIL=chemnaam@gmail.com`
- `CONTACT_EMAIL=chemnaam@gmail.com`
- `CONTACT_PHONE=9908840322`

Until a custom sending domain is purchased and verified, leave both values absent:

- `RESEND_API_KEY`
- `EMAIL_FROM`

Do not enter a fake sender. Invitations remain securely recorded as provider-not-configured rather than falsely marked sent.

## 4. Deploy backend test, then production

1. Deploy `backend/` from this V3.3 source to the temporary Render test service.
2. Confirm `/api/v1/health` returns 200.
3. Confirm an authenticated bootstrap succeeds from the test frontend.
4. Check Render logs contain no schema, Firebase, CORS or encryption error.
5. Only after the Neon-branch acceptance pass, schedule a short production maintenance window.
6. Apply migration 005 once to production Neon.
7. Deploy the V3.3 backend on Render.
8. Verify health and one authenticated read before deploying the frontend.

## 5. Deploy frontend

1. Put the editable V3.3 source at the GitHub repository root using the existing unpack workflow.
2. Do not commit `node_modules`, `.venv`, `dist`, secrets or service-account files.
3. Keep Vercel environment variables pointed at the production backend/API configuration already used by V3.2.1.
4. Let the Git integration deploy `main`.
5. Test sign-in, Settings and one read-only screen first.
6. Run the full acceptance checklist.

## 6. Important V3.3 behavior changes

- Donor location is stored only as an approximate area; existing donor points are snapped to an approximately 2 km grid by migration 005.
- Pending screenings created before V3.3 have no donor-selected review assignment. The donor must submit a new pre-check and choose a verified facility.
- Hospital clinical queues now require a verified facility and show only screenings explicitly assigned to it.
- Optional email, SMS, rare matching and lifecycle notifications default off for newly created preferences.
- Turning off nearby location matching deletes the persisted approximate donor point.
- Intake mutations deliberately require a live connection; the PWA does not claim unsafe offline clinical verification.

## 7. Rollback principle

If acceptance fails after backend deployment:

1. Stop new V3.3 operations.
2. Redeploy the recorded V3.2.1 backend/frontend commit.
3. Do not drop V3.3 tables or columns; they are additive and V3.2.1 ignores them.
4. Preserve audit evidence and diagnose on a Neon branch.

Because migration 005 reduces donor coordinate precision, rolling back application code does not reconstruct earlier exact donor locations. This is intentional privacy minimization.
