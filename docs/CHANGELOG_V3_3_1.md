# RaktFlow V3.3.1 — revision update

V3.3.1 addresses the user's report list on top of V3.3. Every change was checked against the
blueprint with a "why does it matter" decision; items that need new tables, external
credentials, or medical certification were deliberately deferred to V3.4 (see
`docs/V3_3_1_REVISION_PLAN.md` §8).

## Pre-check questionnaire (donor)

- Conditional dates: tattoo/piercing, malaria-return, surgery/transfusion, antibiotics and
  pregnancy/delivery dates are required **only when** the linked question is answered Yes
  (client `data-required-when` + change listener; hint "Only if you answered Yes").
  `last_donation_date` remains optional.
- Weight now has a real clinical floor: min 25 kg / max 250 kg with an inline hint, enforced
  in the browser **and** server-side (`ge=25`), plus an explicit client check with a toast.
- Vitals entry (clinical assessment) carries sensible bounds: hemoglobin 2–25 g/dL,
  pulse 30–220 bpm, systolic 50–260, diastolic 30–180 (server bounds already existed).
- Two added questions for better data: `alcohol_within_24_hours`,
  `recent_immunization_14_days` (Yes → review flag).
- Questionnaire version advanced to `IN-PRECHECK-2026-02`; server accepts 01 and 02.
- The "choose a confidential review facility" UI option and its extra consent checkbox were
  **removed**. Assignment is automatic: donor-selected facility (if any) → nearest verified
  facilities → same-state verified → platform-admin queue.

## Screening answers visible to authorised staff (never inside the QR)

- `/intake/scan` and `/intake/manual` responses include a `screening` summary: outcome,
  flags, deferral reasons, weight, condition answers and applicable dates, decrypted
  server-side from the PrivacyVault with the `screening:<donor-id>` context.
- Organizer donor card and clinical review cards render the summary
  (`precheckSummaryMarkup`). The QR payload itself stays opaque, signed and PII-free.
- Fix: `manual_checkin` route was missing its `settings` dependency (was undeclared) —
  Ruff F821 caught it; added.
- Fix: `_auto_assign_review_facilities` read `DonorProfile.latitude/longitude` which do not
  exist (donor coordinates live in the `location` Geography column) — would have raised
  `AttributeError` on every screening submit. Now ranks with `ST_Distance` against
  `profile.location` and falls back to same-state verified facilities. Regression test added.

## QR reliability ("takes multiple tries", second camera popup, fake animation)

- Pass token validity is 90 s (window rotation), decode tolerates ±10 s clock skew.
- Pass modal draws a single 480 px QR (ECC "M", margin 2) into the same modal — no
  intermediary animation screen; a 1 s live countdown + `live` pulse indicator; the token is
  refetched 20 s before expiry and the canvas redraws in place.
- The organizer intake scanner is now an inline camera surface in the page (no second modal),
  with a status line ("camera idle", "code detected — checking…", retry hint), a Stop camera
  control, and it keeps scanning after a rejected/expired token instead of dying on the
  first miss. `processQrToken` returns pass/fail so the scanner can react.
- Photo scan path got the same try-harder treatment; the "not a RaktFlow QR" message is only
  shown when nothing decodable is found.

## Fewer, clearer controls

- Donor Pass is reachable from exactly one obvious place (the pass card); the duplicate
  open-pass button on the donor home header was removed.

## Drive data visible and separated per drive

- `/drives/mine` returns a per-drive summary (registrations, check-ins, cleared,
  units logged, unique donors, volume mL).
- Organizer drive cards show the live metrics and expose Roster and Report actions that load
  that exact drive — data never mixes between drives, including same-venue drives by
  different organizers (server scope per `drive_id` + per-drive UI reload).

## Hospital / blood-bank portal access

- The portal now shows the precise verification stage: PENDING (evidence + reassurance),
  REJECTED (reason + resubmit button), VERIFIED (active notice).
- Resubmission after rejection works (was a 409 "already exists" for any status);
  the same registration number on a rejected application is allowed and the profile is
  reset to PENDING for re-review.
- Super Admin is included in the clinical review queue + assessments so unassigned
  pre-checks still get human review (separation of duties preserved).

## Donor map: public hospital / blood-bank layer

- New `frontend/src/public/blood-banks.js`: 167 curated major Indian hospitals and blood
  banks (public facility data only: name, city, state, town-level lat/lng — no addresses,
  phones or PII; DPDP-minimised coordinates).
- Donor map now shows drives + facilities + verified centres + verified needs with a
  dedicated teal marker and legend entry; pin cap raised 80 → 240. A note explains the
  points are references to be verified with the facility before travelling.
- Map adapter: `bank` pin colour, `legend-bank` class, Mappls-ready path unchanged.

## Validation (local, all green)

- Backend: pytest **50 passed**, `ruff check app tests` clean, app boots with 101 routes.
  (mypy reports pre-existing optional-`User`/SQLA typing noise in untouched files — not part
  of the release gate; the one real type error it surfaced, the `latitude/longitude` bug,
  was fixed and is regression-tested.)
- Frontend: ESLint clean, Vitest **5/5**, Vite production build clean
  (`VITE_API_BASE_URL=https://raktflow-api.onrender.com`), PWA service worker built
  (16 precache entries), lazy scanner chunk emitted.
- Locales: all eight files extended to **803 keys** with full parity (21 new keys each).

## Deployment note

- Frontend and backend changed together (v02 questionnaire) — deploy the API first, then the
  web app, then fully close and reopen the tab (Workbox caches assets/pages).
