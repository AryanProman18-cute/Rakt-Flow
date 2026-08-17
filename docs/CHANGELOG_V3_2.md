# RaktFlow V3.2 changelog

Release date: 17 August 2026

## Interface and sign-in

- Preserved the preferred V3 visual system and replaced external typography with the Apple/system font stack.
- Added a small post-login workspace loader and actionable Render/API/CORS configuration errors instead of a silent landing-page bounce.
- Kept language selection off the public landing page and moved it into authenticated workspaces.
- Added complete static catalogs for English, Hindi, Telugu, Bengali, Marathi, Tamil, Kannada, and Malayalam. All catalogs have identical key coverage and are code-split for mobile loading.
- Improved responsive dashboards, drawers, bottom navigation, forms, modals, tables, scanner, posters, reduced-motion behavior, focus indicators, and subtle animation.
- Made the profile avatar operational and added account, profile-editing, role-switching, and sign-out controls.

## Public initiative

- Rewrote the landing-page initiative explanation, safety boundaries, five-portal workflow, and donor call to action.
- Improved mobile presentation and visibility of **Become a donor**.
- Added Contact Us with `chemnaam@gmail.com` and `9908840322`.
- Added the in-app donor footer message “Made with care in India.”

## Donor workflow and safety

- Added persisted donor profile creation/editing with date of birth, protected phone, city, blood group, and geolocation.
- Added 100 km nearby filtering for verified drives, facilities, and blood needs.
- Added a network-free embedded mini-map with a progressive Mappls SDK adapter; no map secret is included in the frontend.
- Replaced preliminary-readiness content with profile completion, blood group, questionnaire/review state, registrations, verified needs, history, and clear next actions.
- Enforced QR issuance only for a complete profile, selected self-reported blood group, latest current questionnaire, and explicit qualified clinical approval.
- Enforced the same latest-screening rule again at QR and manual intake so an older approval cannot override a newer pending/declined pre-check.
- Kept final on-site assessment and collection-time testing separate and mandatory.
- Kept donor QR payloads opaque and signed; authorized intake receives only minimum donor details after server verification.

## Drives, intake, and reconciliation

- Added real donor-to-drive registration and persisted organizer rosters.
- Added direct organizer drive creation, Super Admin approval, and clear separation from hosted-drive proposals.
- Added Host Venue proposal decisions that create approved drives for the original organizer.
- Added QR camera scanning over HTTPS, uploaded-image QR decoding, and audited manual-reference intake.
- Added check-in, clinical assessment, donation recording, unit totals, and post-drive reconciliation from PostgreSQL records.
- Added drive/facility coordinates to new workflows so donor discovery can remain local.

## Hospitals, blood banks, and evidence

- Added persisted facility applications and notifications to `chemnaam@gmail.com`.
- Added encrypted PDF/JPG/PNG facility evidence uploads, applicant access, Super Admin metadata/review/download, and an evidence requirement before verification.
- Kept inventory and blood-request operations locked until facility verification.
- Kept signed requisition uploads encrypted and donor alerts restricted to clinically verified requests.

## Staff access and Super Admin

- Kept donor self-registration restricted to `ROLE_DONOR` by default.
- Added invitation links containing only an invitation UUID; acceptance requires the exact Firebase-verified email.
- Added real Resend delivery status and multi-role access managed from PostgreSQL/Firebase claims.
- Added Super Admin overview, user/role controls, invitations, facility evidence decisions, drive approvals, platform records, and append-only audit views.
- Translated technical role, status, component, urgency, inventory-event, resource, and audit labels on authenticated screens.

## Campaigns

- Replaced dummy promotion content with persisted campaign create/edit/publish workflows tied to real drives.
- Added custom slugs and verified-account registration links.
- Added editable poster content/colors, downloadable SVG posters, downloadable QR PNGs, copy/share controls, and Resend email sharing.
- Added keyed-hash visitor records, unique/total visit counts, campaign-attributed registrations, and conversion analytics without storing visitor IP addresses.

## Database and deployment

- Added additive migration `004_integrated_workflows.sql`; it does not delete existing Neon records.
- Added campaign, campaign-visit, drive-registration, screening-review, and encrypted hospital-evidence structures.
- Preserved Firebase, Neon, Render, Vercel, and GitHub deployment architecture.
- Added updated Render/Vercel/Firebase/Resend deployment and smoke-test guidance in `APPLY_V3_2_UPDATE.md`.

## Validation

- Python compilation and AST parsing pass.
- Ruff backend lint passes.
- Backend pytest suite includes V3.2 campaign, clinical-decision, registration attribution, authorization, location-pair, and latest-screening tests.
- Frontend ESLint, Vitest, syntax checking, production Vite/PWA build, and eight-catalog mechanical coverage checks pass.
