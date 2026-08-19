# RaktFlow V3.3 acceptance checklist

Use real secondary accounts controlled by the project owner. Do not use disposable email accounts or real patient data.

## Global

- [ ] Email/password sign-in works; Google sign-in is tested only after the known OAuth redirect mismatch is resolved.
- [ ] All five workspaces switch only when the server assigned the role.
- [ ] All eight languages cover every authenticated screen.
- [ ] Mobile headers, modal close controls, safe areas, keyboard scrolling and bottom navigation work.
- [ ] Settings persists appearance, language, notification and privacy choices across sign-in/device refresh.
- [ ] Exact CORS preflight succeeds for the Vercel production origin and fails for an unlisted origin.
- [ ] Contact details show `chemnaam@gmail.com` and `9908840322`.
- [ ] No screen displays demo data.

## Donor

- [ ] Under-18 profile submission is blocked with an actionable message.
- [ ] Location is captured through the button; profile response contains only the approximate area.
- [ ] Turning off nearby matching removes nearby results and the stored approximate point.
- [ ] Profile displays a prominent manual donor reference.
- [ ] Pre-check uses large Yes/No cards and conditionally supplied event dates.
- [ ] A verified review facility must be selected with explicit purpose consent.
- [ ] Active deferral countdown blocks premature approval and drive registration.
- [ ] Donor QR remains locked before qualified review.
- [ ] After the selected facility approves, Refresh synchronizes QR readiness and a rotating opaque QR can be generated.
- [ ] QR source contains no donor name, phone, blood group or medical answer.
- [ ] Nearby maps display real embedded pins and attribution, or a clean no-results/error state.
- [ ] Privacy export downloads valid JSON.
- [ ] Privacy/data-rights request persists and appears in Settings.
- [ ] Opted-in lifecycle notification contains facility use only and no patient identity.

## Organizer

- [ ] Direct drive creation succeeds with valid dates and paired coordinates.
- [ ] Invalid date/coordinate/authorization responses are specific, not generic.
- [ ] Venue proposals display pending/approved/change/rejected status.
- [ ] Quotas link only to active verified needs with the same blood group.
- [ ] Reaching a quota blocks registration with a donor-visible reason.
- [ ] Intake camera opens only in a secure online context with permission.
- [ ] Uploaded QR image and manual donor reference both work.
- [ ] Intake rejects an unowned, unapproved/closed drive and an unapproved/outdated donor screening.
- [ ] On-site clinical assessment and donation recording remain separately authorized.
- [ ] Collection creates one blood unit and one root component.

## Hospital / blood bank

- [ ] Unverified facility cannot access clinical, inventory, request or component operations.
- [ ] Clinical queue shows only donor-selected assignments for this verified facility.
- [ ] Queue omits donor display name and decrypted answers.
- [ ] Approval remains blocked during an active deferral countdown.
- [ ] Requisition OCR shows blood/date/facility candidates but never claims authenticity.
- [ ] Verified request requires source document, physician authority, component and mismatch-resolution confirmation.
- [ ] Duplicate active facility reference/blood-group request is suppressed.
- [ ] Existing internal/Code 128/ISBT 128 label can be scanned; no certified generation is claimed.
- [ ] Component policy records shelf life, temperature range and facility SOP reference.
- [ ] Expiry dashboard colors expired/24-hour/soon/policy-window stock.
- [ ] Component event history is immutable after transfusion/discard finalization.
- [ ] Cold-chain dispatch and destination receipt capture both temperatures and actors.
- [ ] Same staff member cannot independently collect and receive/finalize the same unit or both dispatch and receive a handover.
- [ ] Traceable unexpired per-unit stock drives quota recommendations.

## Host Venue

- [ ] Proposal decision controls work only for the addressed host email.
- [ ] Approval creates an approved Organizer drive.
- [ ] Impact page shows actual aggregate registrations, check-ins and units for hosted drives.
- [ ] Host cannot see donor identity, medical answers or unit-level clinical data.

## Super Admin

- [ ] Donor self-registration receives only DONOR by default.
- [ ] Non-donor access remains invitation-only.
- [ ] Multiple-role assignment works while resource ownership and two-person custody controls still prevent self-verification loops.
- [ ] Hospital evidence download/review and facility decision work.
- [ ] Invitation without Resend configuration is recorded as provider-not-configured, not falsely sent.
- [ ] Privacy request queue exposes details only to Super Admin and records an audit event for each decision.
- [ ] Audit trail contains screening assignment, OCR review, quota, custody, component, consent and data-rights events.

## Resilience and failure handling

- [ ] PWA shell loads after a prior successful visit with connectivity unavailable.
- [ ] Clinical intake controls disable offline and clearly state that secure online verification is required.
- [ ] Reconnecting refreshes operational data without duplicating a check-in or donation.
- [ ] Render cold-start loading is visible and does not create duplicate form submissions.
