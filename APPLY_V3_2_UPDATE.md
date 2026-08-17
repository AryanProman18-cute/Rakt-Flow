# Apply the RaktFlow V3.2 update

V3.2 keeps the preferred V3 interface and existing Firebase, Neon, Render, Vercel, and GitHub services. Do **not** recreate the services or reset Neon.

## 1. Back up before changing anything

1. In Neon, create a branch or restore point from the current production branch.
2. Keep the current Render and Vercel deployments available for rollback.
3. Do not paste passwords, tokens, API keys, or Firebase service-account JSON into chat or source control.

## 2. Update the repository

Use `RaktFlow_v3_2_GitHub_Update.zip` with the repository's existing unpack workflow, or extract the portable ZIP locally and commit its contents. Repository files belong at the repository root; do not commit the containing ZIP folder.

The GitHub update ZIP intentionally does not replace `.github/workflows/*`.

## 3. Apply the additive Neon migration

Run only the new migration against the existing production database:

```sql
-- Run the complete file:
migrations/004_integrated_workflows.sql
```

Do not rerun migrations 001–003 on an established database and do not drop existing tables. Migration 004 adds clinical-review state, campaigns and privacy-safe visits, drive registrations, and encrypted facility-evidence documents.

Confirm these tables/columns exist afterward:

- `screenings.review_status`, `reviewed_at`, `review_note`
- `campaigns`
- `campaign_visits`
- `drive_registrations`
- `hospital_application_documents`

## 4. Update Render

Open **Render → raktflow-api → Environment**. Keep all existing values and confirm:

- `APP_ENV=production`
- `DATABASE_URL` points to the existing Neon database (asyncpg URL, SSL enabled)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CREDENTIALS_JSON` (secret, Render only)
- `CORS_ORIGINS=["https://raktflow-demo123.vercel.app"]` (use a JSON array; add any custom production domain as another quoted array item)
- `TOKEN_SIGNING_SECRET` is a strong, stable secret of at least 32 characters
- `BOOTSTRAP_ADMIN_EMAIL=chemnaam@gmail.com`
- `PUBLIC_APP_URL=https://raktflow-demo123.vercel.app`
- `PII_ENCRYPTION_KEY` remains the existing stable encryption key
- `PHONE_HASH_PEPPER` remains the existing stable pepper
- `MAX_DB_CONNECTIONS=5`
- `RESEND_API_KEY` is the secret API key for a verified Resend domain
- `EMAIL_FROM=RaktFlow <noreply@your-verified-domain>`
- `ADMIN_NOTIFICATION_EMAIL=chemnaam@gmail.com`
- `CONTACT_EMAIL=chemnaam@gmail.com`
- `CONTACT_PHONE=9908840322`

Never rotate `PII_ENCRYPTION_KEY` or `PHONE_HASH_PEPPER` without a planned data migration. Save and deploy the latest commit. Check:

```text
https://raktflow-api.onrender.com/api/v1/health
```

## 5. Update Vercel

Open **Vercel → project → Settings → Environment Variables**. Confirm for Production:

- `VITE_API_BASE_URL=https://raktflow-api.onrender.com` — use only the service origin, not `/api/v1/health`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

Leave the Vercel Root Directory blank for this repository layout. The root `vercel.json` reverse-proxies `/__/auth/*` to Firebase Hosting for cross-browser Google authentication. Add `https://raktflow-demo123.vercel.app/__/auth/handler` to the Firebase Google OAuth web client's authorized redirect URIs. Redeploy after saving variables. The frontend build is `npm run build` and output is `frontend/dist`.

## 6. Firebase checks

In Firebase Authentication:

1. Keep **Email/Password** enabled.
2. Keep **Google** enabled if it is offered in the UI.
3. Add `raktflow-demo123.vercel.app` and the production custom domain to **Authorized domains**.
4. Do not store operational data in Firebase; Firebase remains identity-only.

## 7. Resend checks

1. Verify the sending domain in Resend.
2. Make `EMAIL_FROM` use that verified domain.
3. Keep the API key only in Render.
4. Send one staff invitation and one campaign share; verify `SENT` status in Super Admin.
5. Submit a hospital application and confirm the notification reaches `chemnaam@gmail.com`.

## 8. Production smoke test

Use a fresh verified donor account and invited test staff accounts:

1. Sign in and confirm the polished loader enters the dashboard rather than returning silently to the landing page.
2. Change each authenticated workspace through all eight languages.
3. Create/edit a donor profile with blood group and geolocation; confirm only nearby drives, centres, and needs are returned.
4. Submit a pre-check. Confirm QR remains locked until an authorized Hospital-role reviewer approves the latest pre-check.
5. Create a direct drive, approve it as Super Admin, and register as the donor.
6. Scan the opaque QR with camera and uploaded-image fallback; record on-site assessment, collection, roster, and reconciliation.
7. Propose a hosted drive and approve it from the exact invited Host Venue account.
8. Submit a facility application with evidence; review/download evidence before verification.
9. Create, publish, share, and visit a campaign; confirm persisted visitors and registrations affect analytics.
10. Confirm Contact Us shows `chemnaam@gmail.com` and `+91 9908840322`.

## Rollback

Roll back the Render/Vercel deployment to the previous commit. Migration 004 is additive; leave its tables and columns in place unless a database specialist has verified a safe rollback. Existing records remain compatible.
