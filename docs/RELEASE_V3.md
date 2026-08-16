# RaktFlow v3 operational release

Release date: 16 August 2026

## Implemented

- Verified-email hospital applications and Super Admin verification/rejection/suspension
- Server-side publishing gate requiring a verified hospital profile
- Component inventory balances plus audited receipt, issue, discard, and directed-adjustment events
- Encrypted, digest-checked PDF/JPEG/PNG requisition storage in PostgreSQL
- Owned request list, explicit clinical verification, verified-facility public alerts, and facility-owned resolution
- Eight ABO/Rh groups plus controlled confirmed rare-phenotype codes
- Organizer-owned drive editing, approval/status workflow, QR/manual intake, and real turnout/collection analytics
- Persisted host-venue proposals with approval, changes-requested, rejection, and resulting drive linkage
- Donor donation history, targeted alert response, verified public demands, approved drives, and verified centres
- OpenStreetMap links without a billing-dependent map API
- Official India-national resources: ERSS 112, Indian Red Cross, and e-RaktKosh
- English, Hindi, Telugu, Bengali, Marathi, Tamil, Kannada, and Malayalam localization architecture with translated navigation and key workflows
- Browser-visible verified-alert refresh and privacy-safe notification opt-in
- New PostgreSQL migration `003_operational_hospitals_inventory_proposals.sql`
- Updated generated OpenAPI document with 47 paths and 52 operations

## Validation

- Frontend Vite/PWA production build: passed
- JavaScript syntax checks: passed
- Ruff: passed
- Python compileall: passed
- Pytest: 16 passed
- SQL parser validation: migrations 001, 002, and 003 passed
- ZIP integrity and required-file validation: passed

The sandbox's Playwright Chromium could not launch because the host image lacks `libnspr4.so`; browser screenshots were therefore not regenerated for this release. The compiled frontend should still be checked on the Vercel preview before production promotion.

## Deployment

- Vercel Root Directory: leave blank
- Apply migrations 001, 002, and 003 in order before starting the updated API
- Configure the frontend Firebase values and `VITE_API_BASE_URL`
- Configure all backend secrets listed in `PRODUCTION_SETUP.md`

## Remaining production gates

This is an operational pilot baseline, not a certified medical device or guaranteed emergency service. Before real clinical use, complete legal/privacy review, clinical SOP approval, malware scanning for requisitions, fine-grained clinical permissions, penetration and tenant-isolation tests, backups/restore drills, monitoring, staff training, and paid reliability planning.
