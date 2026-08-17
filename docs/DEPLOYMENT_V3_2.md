# V3.2 deployment reference

For the short production sequence, use [`../APPLY_V3_2_UPDATE.md`](../APPLY_V3_2_UPDATE.md).

## Production topology

- **Vercel:** Vite/PWA frontend in `frontend/`
- **Render:** Dockerized FastAPI service in `backend/`
- **Neon:** Existing PostgreSQL + PostGIS data, extended only by ordered SQL migrations
- **Firebase Authentication:** identity and verified email only
- **Resend:** staff invitation, facility-notification, and campaign-share email
- **GitHub:** source and deployment trigger; no secret values belong in the repository

## Build and validation commands

```bash
cd frontend
npm ci
npm run lint
npm test
npm run build

cd ../backend
python -m pip install -r requirements.txt -r requirements-dev.txt
ruff check app tests
pytest -q
```

## Migration order for a new database

```text
001_initial.sql
002_identity_rbac_intake.sql
003_operational_hospitals_inventory_proposals.sql
004_integrated_workflows.sql
```

An existing V3 production database applies only migration 004 for this release.

## Privacy boundaries

- Firebase tokens authenticate; PostgreSQL authorizes.
- New uninvited accounts receive Donor access only.
- QR payloads are rotating signed tokens, not donor PII.
- Phone, questionnaires, on-site measurements, requisitions, and facility evidence are encrypted at rest.
- Campaign visitors are keyed hashes; IP addresses are not persisted.
- Public blood requests omit patient identity.
- Embedded fallback maps use API coordinates only. A Mappls deployment key is optional and must be configured through the official SDK without committing a secret.

## Operational dependencies

Camera scanning requires HTTPS and browser permission. Uploaded-image decoding is always available as the fallback. Render free services may need a short wake-up period; the frontend prewarms the API and reports a retryable error if startup does not finish.
