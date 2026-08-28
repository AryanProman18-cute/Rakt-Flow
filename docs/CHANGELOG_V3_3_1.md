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

## Hotfix: Google sign-in in private/in-app browsers + cold-start resilience

Audited after the first live roll-out (two new user screenshots):

- **Google sign-in now uses popup-first flow.** `signInWithRedirect` fails in
  storage-partitioned browsers (WhatsApp/Instagram/Telegram in-app browsers, Brave,
  some Safari/Firefox privacy modes) with Firebase's "missing initial state" error —
  the handler page cannot read the pending state across the partition boundary.
  Popup mode communicates over `postMessage` and works there. Fallback to redirect
  remains for browsers that block popups. Vercel's `/__/auth/*` proxy is unchanged,
  so the redirect path stays first-party where it is used.
- **Clear guidance instead of the raw Firebase error**: the "missing initial state"
  message is now translated into "open in Chrome/Safari or use email & password",
  with mappings for `auth/redirect-cancelled-by-user`, `auth/unauthorized-domain`,
  `auth/web-storage-unsupported`.
- **Bootstrap auto-retry**: if the account bootstrap fails because the free Render
  service is still waking up (transport error only — API rejections still surface
  immediately), the app re-warms the API and retries twice with a 3.5 s pause before
  showing the error screen with the manual Retry button. The existing `/api/v1/ping`
  pre-warm on app load stays.
- Tests: `auth.test.js` extended to 6 (partitioned-browser + redirect-cancelled mapping).

## Hotfix 2: screening submit unblocked + component release gates (user re-test)

**The live report "dates are still compulsory" was traced to two causes:**
1. The live API (not yet redeployed) still rejects `IN-PRECHECK-2026-02` and demands
   `review_hospital_id` + `consent_to_selected_facility_review` — so every submit
   returned raw field errors that looked like the form was still forcing answers.
   The UI now detects exactly this signature and shows a clear message
   (`error.outdatedApi`): *"The server is still running an older version of
   RaktFlow… deploy the latest API, then submit again."*
2. Native browser `required` toggling on the date inputs could block with confusing
   bubbles. Dates are now **never** natively required; `saveScreening` validates
   them in JS with precise toasts:
   - every Yes/No question must be answered (toast names the first missing one);
   - a date is needed **only** when its linked answer is "Yes" (toast says which);
   - both attestation consents must be ticked;
   - date values are forced to `null` in the payload when the answer is not Yes
     (never sent wrongly), weight stays 25–250 kg with its own message.
   The form uses `novalidate` so no stray browser bubbles appear.

**Component release gates (blueprint item, now implemented — no migration):**
- `app/services/components.py`: `verify_status_transition()` — hard gates:
  expired units can never be reserved/released/issued/transfused; double issue
  blocked; transfusion only from an issued unit; invalid `from` states blocked.
  Discarding an expired unit is still allowed (safe disposition).
- `app/api/routes/components.py` event route now enforces the gates (409 + reason).
- Frontend: the component event modal shows the **locked state** — a warning banner
  with the reason and the blocked options disabled with tooltips
  (`components.notPermitted` + per-reason copy, 8 locales).
- Tests: `test_component_release_gates_block_unsafe_forwarding` (healthy flow,
  expired forward, double issue, transfuse-before-issue, discard-expired).
- Locales: 812 keys × 8 languages, full parity.

**Already in this hotfix round:** Google sign-in popup-first (partitioned browsers),
bootstrap auto-retry, `RENDER_HEALTH_URL` keep-warm activation.

## Hotfix 3: "could not reach the API" — sleep-window resilience + auto-deploy

Diagnosed live (2026-08-28): the API was healthy (200 in ~300 ms) and CORS was correct —
the failure happens when the **free Render service is asleep**: the first connection
after idle is dropped, and the app showed the misleading "Check Render and CORS" toast.

- **Reads retry once** on a dropped connection (GET/HEAD/OPTIONS) inside `apiFetch`; writes
  are never silently double-submitted.
- **`pingApi()` probe**: when a write fails on a network drop, the app now pings the API
  and says *"The backend is waking up. Wait a moment and retry."* if it is reachable
  again (accurate + actionable), instead of blaming CORS.
- **Wake-on-refocus**: returning to a backgrounded tab pre-warms the API
  (`visibilitychange` → `prewarmApi`), so the sleep race is closed before the user taps.
- **Keep-warm now runs without a secret** (defaults to the public Render health URL) —
  this workflow must exist in the repo's `.github/workflows/` to keep the service warm.
- **`render-deploy.yml`**: push to `main` (backend paths) triggers the Render Deploy Hook
  automatically and polls until `IN-PRECHECK-2026-02` is live, failing loudly otherwise.
  Add the `RENDER_DEPLOY_HOOK` secret once (Render → raktflow-api → Settings → Deploy Hook).
- **Super Admin "Drive approvals" now lists ALL drives** (`/admin/data`), so a planned
  drive created by any organizer can be approved from the UI.

## Hotfix 4: unpack workflow push failure (GITHUB_TOKEN cannot add workflow files)

- Diagnosis: the repo ZIP was valid; the failure was the `git push` in the "Save extracted
  source" step. The archive shipped `.github/workflows/render-deploy.yml`, and GitHub rejects
  pushes made with `GITHUB_TOKEN` that create/modify workflow files.
- Fix in repo: `unpack.yml` now removes **every** workflow file (except itself) before the
  commit — `.github/workflows` is never touched by the unpack push again.
- Fix in the deliverable: the archive no longer ships any `.github/workflows/` files, and
  `render.yaml` now ships with `autoDeploy: true` (Render rebuilds on every push to main —
  one final manual "Deploy latest commit" applies the blueprint change).
- Guide: `docs/DEPLOY_UNPACK_FIX_2026_08_28.md` (corrected unpack.yml + keep-warm.yml + steps).

## Hotfix 5: submit auto-waits for the sleeping API (no double-tap)

Live diagnosis (2026-08-28): CORS preflight 200 with exact origin, POST route reachable
(401 unauth), 8/8 health probes 200, schema v02 live — the API is healthy; the failures
are the free-tier sleep window (Render sleeps after ~15 min idle; keep-warm not in repo).

- `api.js`: all requests get a 45 s timeout (AbortController) so a request during cold
  start fails cleanly instead of hanging; added `waitForApi()` — polls health up to 90 s.
- `main.js`: new `withBackendReady()` — for critical writes (screening submit, manual
  check-in, clinical assessment, donation record, clinical review decision, drive status):
  1) if the API is unreachable, show "backend waking up" and wait for it;
  2) submit; 3) if the connection still drops, wait again and retry exactly once.
  The user should never have to tap Submit twice because of a cold start.
- `saveScreening` keeps the specific outdated-API detection (v01 server) and now refreshes
  the profile and confirms success after submit.

## Hotfix 6: GET pings, silent cold-start wait, visible build label

Follow-up (2026-08-28): the 5-stage evidence confirmed the API healthy (240s watch:
20/20 probes <1 s; real Firebase token submit answered 217 ms with 403 "role" — auth,
CORS and the write route all work). The deployed UI, however, still produced the
"backend waking up" toast on devices even though the API answers instantly — and the
old and new bundles are pixel- and wording-identical (the toast copy is the same in
both), so a screenshot could never tell which version a device runs. Hotfix 6:

- `api.js`: `pingApi()` and `prewarmApi()` now use **GET** on `/api/v1/health` instead
  of HEAD (GET is the path proven to work from the affected device; `/api/v1/ping` is
  HEAD-only and is no longer used by prewarm).
- `main.js` (`withBackendReady` + `saveScreening`): the "backend waking up" toast is
  now shown only after the API is still unreachable after ~26 s of silent waiting —
  transient cold starts no longer alarm users; the auto-wait + auto submit still follows.
- `main.js`: visible **build tag `v3.3.1-h6`** in the pre-check modal subtitle and the
  in-app footer, so any screenshot identifies the deployed build at a glance.

## Hotfix 7: patient timeouts for networks that stall HTTP/3

Root cause found with the user's own screenshot: the deployed Hotfix-6 modal (build tag
v3.3.1-h6 visible) still timed out. Backend healthy (240 s watch: 20/20 < 1 s; real-token
submit 217 ms) and the address-bar GET of `/api/v1/health` works on the same device, but
every fetch from the page failed within its timeout. The API response advertises
`alt-svc: h3=":443"; ma=86400` (Cloudflare HTTP/3) — on mobile networks that stall UDP/443,
the browser must fall back to TCP, which takes several seconds. The app's 6 s ping / 45 s
request deadlines aborted *before* the fallback; a navigation (address bar) has no abort
and succeeds. Hotfix 7 gives the fallback room:

- `api.js`: default request timeout 45 s → **75 s**; `pingApi` default 8 s → **15 s**;
  `waitForApi` polls with **15 s** pings; `prewarmApi` abort 4.5 s → **12 s**.
- `main.js`: submit-time and recovery pings use **20 s** deadlines.
- `BUILD_TAG` → `v3.3.1-h7` (visible in the pre-check modal subtitle + in-app footer).
- Net effect: one tap now tolerates multi-second connect fallbacks and a 30–90 s Render
  cold start; the submit still retries once, then reports honestly.

## Hotfix 8: same-origin API through a Vercel rewrite (no direct Render calls)

Decisive screenshot: the user's device ran v3.3.1-h7 and STILL timed out every ping
(20 s deadlines) while the API was repeatedly verified healthy (0–1 s responses) and the
same device loaded the Vercel-served app itself instantly. The failing leg is therefore
the direct browser→onrender.com connection (Cloudflare HTTP/3 stall on mobile links),
not the app, not the backend. Fix: stop using that leg.

- `vercel.json` (repo root and `frontend/`): `/api/:path*` is now rewritten (proxied)
  to `https://raktflow-api.onrender.com/api/:path*` — the API and the UI share one
  Vercel origin, which the device already reaches reliably.
- `frontend/src/api.js`: `API_BASE` is now same-origin (`''`); `VITE_API_BASE_URL`
  (dashboard variable pointing at the Render origin) is no longer read, so the proxy
  path cannot be bypassed. All 5 "not configured" guards removed because same-origin
  `/api` is always available when the app is served by Vercel.
- Same-origin means **no CORS at all** for API calls, and all traffic rides the same
  CDN path as the UI.
- `BUILD_TAG` → `v3.3.1-h8`.
- Safety check: the app has no WebSocket/SSE dependency on the API (live data uses
  Firestore), so the rewrite is lossless.
- After deploy, verify with: `https://raktflow-demo123.vercel.app/api/v1/health` →
  `{"status":"ok",...}`.

## Hotfix 9: auto-applied DB migration — the real 500 root cause

End-to-end reproduction (verified email → bootstrap → ROLE_DONOR → profile → exact
screening payload, through the Vercel proxy): **POST /donors/me/screenings → 500**.

Root cause: the repo's SQL migrations (001–005) were never applied automatically;
the Dockerfile only ran uvicorn, render.yaml had no migration step, and the server
had no migration runner. The live `screenings` table is still 001-era — missing
`questionnaire_version`, `flags`, `attested_at`, `review_status`, `reviewed_at`,
`review_note`, `eligible_on`, `deferral_reason_codes`, and its `outcome` CHECK does
not include `TEMPORARY_DEFERRAL_SUGGESTED` — so every screening insert fails with a
500 ("column does not exist") and the UI shows the generic "Action could not be
completed" toast.

Fix:
- `migrations/006_screening_submit_fix.sql` — idempotent (IF NOT EXISTS / DROP
  CONSTRAINT IF EXISTS) upgrade of the screenings schema + the
  `screening_review_assignments` table; safe on any database state.
- `backend/app/core/migrate.py` + lifespan hook in `main.py` — at startup, pending
  `migrations/*.sql` are applied in order and tracked in `schema_migrations`
  (best-effort: failures are logged, the API still starts).
- `backend/Dockerfile` — ships `migrations/` into the image.
- Frontend `BUILD_TAG` → `v3.3.1-h9`.

## Hotfix 10: moved migrations into the app package (fixes Render build error)

Hotfix 9 shipped `COPY migrations ./migrations` in backend/Dockerfile, but
render.yaml builds with `dockerContext: ./backend`, so that COPY had no source
and **the Render deploy failed (build error)** — "not deployed".

Fix:
- `backend/app/migrations/*.sql` — migrations now live inside the app package,
  shipped by the existing `COPY app ./app` (Dockerfile back to the h8 form).
- `backend/app/core/migrate.py` — rewritten: raw asyncpg connection,
  statement-aware splitting (handles `$$` plpgsql bodies), per-file
  transactions, and `001_initial.sql` presumed-applied when the `screenings`
  table already exists (no replay of CREATE TABLEs on pre-existing DBs).
- `app/main.py` lifespan uses `engine.connect()`.
- Frontend `BUILD_TAG` → `v3.3.1-h10`.

Hotfix 10 (final): migrator hardened — validated on real PostgreSQL 16.
- 006 now also CREATE TABLE IF NOT EXISTS hospital_profiles (self-sufficient
  for the submit path even if migration 003 could not run).
- migrate.py uses structlog (stdlib logging rejected `file=` kwargs and would
  have crashed the migrator on the first failed migration).
- Tested against a real PG16 cluster, two scenarios: (A) clean 001-era DB —
  all of 001-006 apply, schema healed, submit-style INSERTs succeed, second
  boot is a no-op; (B) pre-existing hospital_profiles — 003 fails by design,
  006 still heals screenings + creates screening_review_assignments, submit
  INSERTs succeed.

## Hotfix 11: screening_review_assignments now accepts NULL selection timestamps

Found in the Render application logs (IntegrityError, sqlalche.me/e/20/gkpj):
submit_screening inserts a ScreeningReviewAssignment per review facility; for
facilities AUTO-ASSIGNED by the server (donor did not pick one), the API
correctly passes NULL for selected_by_donor_at and purpose_consent_at — but
the table declared both columns NOT NULL, so the INSERT failed with an
IntegrityError -> HTTP 500 -> the app's "The action could not be completed"
toast. The screening row itself inserted fine; the assignments INSERT was the
failure point.

Fix:
- migrations/007_screening_assign_nullable.sql — ALTER ... DROP NOT NULL on
  both columns (idempotent, single statement; applied automatically on boot).
- migrations/006 trimmed to the screenings heal only (standalone, no
  dependency on other tables), so 006 and 007 apply independently even when
  other migrations cannot run.
- backend/app/models/entities.py — the two columns are now Optional.
- Frontend BUILD_TAG -> v3.3.1-h11.
- Validated on real PostgreSQL 16: fresh chain (001-007) and live-shaped DB
  (NOT NULL table pre-existing, 003/005 failing) both insert the exact
  auto-assigned row (NULL, NULL) successfully.
