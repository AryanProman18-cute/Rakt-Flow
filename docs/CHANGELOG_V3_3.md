# RaktFlow V3.3 combined update

V3.3 preserves the preferred V3 interface and combines the original V3.3 defect/logistics work with accepted improvements from the 12-page screenshot-analysis PDF.

## Mobile and account experience

- Modal close controls remain at the true upper-right with safe-area and dynamic-viewport sizing.
- Settings is a first-class page on all five portals.
- Appearance, all eight authenticated languages, server-assigned workspace switching, account controls, optional alert channels, privacy controls and sign-out are consolidated in Settings.
- Donor pre-check Yes/No inputs use large one-tap cards instead of repeated mobile dropdowns.
- Donor clinical review and QR readiness can be refreshed explicitly.
- Manual donor reference is prominent while QR payloads remain opaque and signed.

## Maps, location and privacy

- Operational maps use a Mappls-ready adapter with a Leaflet/OpenStreetMap embedded fallback, real coordinates, pins and attribution.
- Facility and drive destinations keep exact public coordinates.
- Exact browser coordinates supplied by a donor are used ephemerally; persisted donor coordinates are snapped to an approximate ~2 km grid.
- Turning off nearby matching deletes the persisted approximate donor location.
- Layered consent records distinguish required registration/safety processing from optional location, rare-alert, email, SMS and lifecycle uses.
- Authenticated users can export their data and submit access, correction, erasure-review, consent-withdrawal, nomination or grievance requests.
- Super Admin has an audited data-rights request queue. Immutable audit and required blood-safety records are never silently deleted.
- Donor registration and screening are adult-gated with configurable age policy.

## Clinical trust boundary

- A hospital-role claim alone no longer exposes the screening queue.
- The donor explicitly chooses a verified hospital/blood bank and consents to that facility's confidential review.
- Only the selected verified facility can list or decide that screening.
- Clinical queue responses omit donor display name and decrypted questionnaire answers, returning only minimum review details and flags.
- Automated pre-screening may calculate configurable deferral dates and block unsafe actions, but never auto-approves QR eligibility or replaces qualified review and final on-site clearance.

## Requests, OCR and verified needs

- Requisition PDF/JPEG/PNG uploads use bounded OCR off the async event loop.
- Extracted text is encrypted; candidates and error states are stored for review.
- OCR can never confer authenticity or a Verified badge.
- Verification requires explicit source-document, physician-authority and component checks; mismatches/unreadable evidence require an authorized manual-resolution confirmation.
- Active duplicate requests from the same facility reference and blood group are suppressed.
- Expired/resolved needs remain excluded from public results.

## Drive operations and quotas

- Direct drive creation exposes actionable validation and authorization errors.
- Intake clearly supports secure camera QR, uploaded QR image and manual reference prerequisites.
- Intake remains limited to owned approved/active drives and clinically approved donors.
- Drive blood-group quotas can link only to active verified facility needs.
- Advisory quota recommendations compare active verified need with traceable, unexpired component stock.
- Registration caps dynamically block oversupplied groups with an actionable reason.
- Host proposals remain integrated in Organizer workflows.
- Host Venue now receives real privacy-safe impact totals for its approved hosted drives.

## Component, unit and cold-chain traceability

- Collection creates an auditable blood-unit and initial component record.
- Existing internal, Code 128 and ISBT 128 identifiers can be scanned and recorded.
- RaktFlow does not claim certified ISBT 128 generation.
- Verified facilities configure component shelf-life hours, temperature ranges and SOP references.
- Component expiry dashboards distinguish expired, 24-hour, soon and policy-window stock.
- Preparation, reserve, release, issue, transfusion, discard and quarantine events are immutable in the timeline.
- Cold-chain handovers capture source/destination, actors, timestamps, container/seal reference and dispatch/receipt temperatures.
- The same person cannot independently collect and receive/finalize the same unit, or dispatch and receive the same handover.
- Hospital inventory prioritizes traceable unexpired per-unit components while preserving the legacy aggregate ledger for reconciliation.

## Rare matching and donor lifecycle

- Rare requests use staged nearby cohorts of currently approved donors who opted into both rare matching and approximate-location matching.
- In-app delivery is immediate; email/SMS remain explicitly ready/queued until real providers are configured.
- Donors can accept or decline active alerts, review expired/answered alert history, and facilities can view minimum-data response history or expand the next cohort after the first response window. Responses and dispatch expansion are audited.
- When authorized facility staff records component use, opted-in donors receive a privacy-safe “Where did my blood go?” update without patient identity.

## Security and resilience

- Production CORS uses exact HTTPS origins, explicit methods and explicit headers; wildcard origins are rejected during production startup validation.
- Fake sender defaults were removed. `EMAIL_FROM` is required only when a real `RESEND_API_KEY` is configured.
- PWA shell/assets remain cacheable for resilient browsing.
- Broken pseudo-offline check-in queuing was removed. Clinical intake is disabled offline because the current signed token requires server-side expiry, latest-screening, ownership and replay verification.
- A future offline clinical mode requires asymmetric signatures, encrypted/revocable device provisioning and tested reconciliation; it is not falsely claimed in V3.3.

## Database

- Migrations `001`–`004` remain unchanged.
- `005_trust_logistics_and_mobile.sql` is additive and introduces screening assignments, OCR metadata, quotas, per-unit/component traceability, facility component policy, lifecycle events, cold-chain handovers, donor notifications, granular consent, user preferences and data-rights requests.
- Existing donation records are backfilled into the unit/component foundation.
- Existing donor locations are reduced to an approximate grid during migration.

## Verification completed in the source workspace

Validated on 19 August 2026 after the final endpoint-boundary additions:

- Backend import and OpenAPI 3.3.0 generation: passed with 89 paths.
- Backend Ruff: passed.
- Backend pytest: 44 tests passed, including explicit role rejection, selected-facility queue scoping/minimum-data response, approximate-location reduction, aggregate Host impact, duplicate component receipt, two-person destination receipt, data-rights encryption and actual CORS preflight boundaries.
- Frontend ESLint: passed.
- Frontend Vitest: 5 tests passed.
- Frontend production Vite/PWA build: passed (16 precache entries).
- All eight locale JSON dictionaries parsed and shared 782 leaf keys; privacy, inventory, Host impact, and rare-alert additions received a semantic localization pass.
- `pglast` accepted all 57 PostgreSQL statements in migration 005.
- Source and packaged-archive secret-name/content scans found no committed runtime `.env`, private key, service-account file or recognized live credential pattern.
- A real migration rehearsal against a copied Neon branch is still required before production execution.
