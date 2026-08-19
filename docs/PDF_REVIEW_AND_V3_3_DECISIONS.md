# RaktFlow V3.3 — PDF review and implementation decisions

Reviewed source: `Comprehensive RaktFlow Screenshot Analysis & Issue....pdf` (12 pages).

## Findings accepted for this combined update

1. **CORS must remain explicit.** Production uses exact configured frontend origins, credential support, an explicit method/header list, and no wildcard origin. Add automated preflight tests and fail production startup if a wildcard is configured.
2. **Donor-location minimization.** Keep real coordinates for public facilities and drive venues, but reduce persisted donor location precision to an approximate area suitable for nearby matching. Do not expose a donor's exact coordinates in authenticated profile responses.
3. **Layered consent and data-principal controls.** Separate required registration/clinical processing from optional nearby matching, rare-alert, email/SMS, and lifecycle updates. Persist consent history and withdrawal events. Add authenticated access/correction/export/deletion-request workflows rather than promising immediate deletion of audit- or blood-safety records.
4. **Age gating.** Donor workflows are adult-only. Reject profiles and screening attempts below the configured minimum donation age.
5. **Least-privilege clinical review.** A hospital-role claim alone must not expose the global queue. Review requires a verified facility and an explicit donor-selected review assignment. The queue returns minimum necessary details and not decrypted questionnaire answers.
6. **Separation of duties.** Preserve the user's required multi-role accounts, but prevent the same human from both creating/collecting and independently receiving/finalizing the same unit or custody handover.
7. **Mobile questionnaire controls.** Replace repeated dropdowns with large one-tap Yes/No/Not-applicable cards.
8. **Actionable empty states.** Provide an opt-in route to local/rare alerts in Settings instead of dead ends.
9. **Communication truthfulness.** Keep Resend/SMS states as queued/ready when providers are absent. Never claim delivery or insert fake sender credentials.

## Findings already addressed

- The backend and Neon connection were restored in V3.2.1. The current CORS implementation already uses explicit origins and headers; the PDF diagnosis reflects an earlier failure state.
- The application is already an installable PWA with a service worker and online/offline status handling.
- QR payloads are opaque and signed; donor PII is not embedded.
- V3.3 already adds explicit OCR human review, configurable deferral countdowns, component/unit traceability, facility shelf-life policy, cold-chain logs, quotas, rare-alert privacy controls, and donor lifecycle notifications.

## Suggestions not implemented as written

1. **No automatic medical approval or instant QR from an algorithm.** Pre-screening may triage and block unsafe actions, but qualified human clinical review and final on-site clearance remain mandatory.
2. **No broad emergency-consent bypass.** A legal emergency override requires counsel-approved lawful-basis rules, two-person authorization, narrowly scoped data, immutable audit evidence, and incident governance. It will not be improvised from a report.
3. **No offline acceptance of the current HMAC QR token.** Shipping the symmetric verification secret to browsers would compromise every pass. A future offline mode needs asymmetric signatures, short-lived scoped public keys, encrypted device provisioning, revocation, replay control, and a tested reconciliation protocol.
4. **No blanket prohibition on multiple roles.** The standing RaktFlow requirement explicitly allows selected staff to hold multiple server-assigned roles. Risk is controlled through resource ownership, verified facilities, clinical assignments, and two-person custody controls instead.
5. **No claim of legal certification.** Product controls support privacy and auditability but require independent Indian legal, clinical, blood-bank, security, accessibility, and ISBT review before production use.

## Packaging rule

All accepted changes are merged into `/home/user/RaktFlow_v3_3_Working/`. The final deliverable will be one editable source ZIP containing the earlier V3.3 fixes and the accepted PDF-driven improvements. V3.2.1 remains the production reference until migration rehearsal and end-to-end acceptance tests pass.
