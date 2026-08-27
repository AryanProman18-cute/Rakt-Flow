# RaktFlow V3.3.1 — Revision Plan (from user bug list + blueprint)

> **STATUS (2026-08-28): IMPLEMENTED + VALIDATED locally.** pytest 51/51, Ruff clean,
> ESLint + Vitest 6/6, Vite/PWA production build clean, 8 locales × 812 keys in parity.
> Remaining: deploy (API → web → hard refresh), then re-verify on the live site.
> Detailed ledger: `docs/CHANGELOG_V3_3_1.md`.

Scope: fix the reported problems and implement the *justified* blueprint items.
Everything is additive. No rerun of migration 005. No PII in QR payloads. No medical claims.

## 1. Pre-check questionnaire (donor)
- Dates (surgery/transfusion, tattoo/piercing, malaria return, antibiotics, pregnancy/delivery)
  are only required when the matching Yes/No question is answered **Yes** (conditional `required`,
  "Only if answered Yes" hint). `last_donation_date` stays optional.
- Weight: hard min 25 kg / max 250 kg enforced client + server (server already enforces; client
  now validates too and shows a clear message).
- Vitals (assessment form): add min/max to hemoglobin, pulse, systolic, diastolic inputs
  (server bounds already exist 2–25 / 30–220 / 50–260 / 30–180).
- Add two more clinically-relevant questions (more data, still no medical claim):
  - `alcohol_within_24_hours` (No is expected; Yes → flag for review)
  - `recent_immunization_14_days` (Yes → flag for review)
- Questionnaire version advances to `IN-PRECHECK-2026-02` (server accepts both 01 and 02 so
  nothing breaks mid-rollout).
- Remove the "Choose review facility" select + its separate consent checkbox.
  Review assignment becomes automatic: donor-selected facility (if any) → nearest verified
  facilities → same-state verified facilities → otherwise the platform admin handles it.

## 2. Pre-check answers now visible to authorised staff (incl. via QR scan)
- `/intake/scan`, `/intake/manual` responses include a `screening` summary: outcome, flags,
  deferral reasons, weight, all condition answers and applicable dates (decrypted server-side
  from the vault; never travels inside the QR itself).
- Organizer donor card + clinical review cards show the summary.

## 3. QR reliability ("takes multiple tries", expired pass)
- Token validity 30 s window → 90 s validity; decode tolerates ±10 s clock skew;
  refresh now happens well before expiry with a visible live countdown.
- Pass QR rendered at 320 px, error correction M (ISO-recommended trade-off), crisp
  pixel-scaled canvas + pulsing "live" border (anti-screenshot animation).
- Scanner: keeps scanning after a wrong/unreadable code (no need to reopen the camera);
  TRY_HARDER decode hints; single inline camera view (removes the double popup).

## 4. Fewer buttons to reach the pass
- Removes the extra Donor Pass button from the donor home header. Kept: journey card (step 3)
  and the single "My Pass" sidebar item.

## 5. Drive data visible & separated per drive
- `/drives/mine` now returns per-drive summary (registrations, check-ins, cleared, units logged).
- Drive cards show live numbers; each card has Roster / Full report actions that switch the
  portal to that drive (data already isolated per drive_id server-side; UI now always reloads
  the selected drive instead of appearing mixed).

## 6. Hospital / blood-bank access
- Portal shows the exact verification stage (pending / rejected + reason / verified) with next steps.
- A rejected applicant can resubmit an updated application (409 bug fixed).
- Platform admin can review & be accountable for pre-checks when no facility is assigned yet.

## 7. Hospitals & blood banks of India on the donor map
- New curated public reference layer (167 major blood banks / hospitals with town-level
  coordinates) shown on the donor map alongside drives, centres and verified needs.
  Purely public facility data, labelled as a reference that must be verified locally.

## 8. Not doing (deliberately, with reasons)
- PWA offline donor caching: current scanner needs server-side pass validation; offline replay of
  pre-signed donor references would weaken the signed-pass security model. Postponed to a
  designed offline-signing scheme, not a shortcut.
- ABHA/ABDM, Telegram, ISBT 128 label printing, OCR: need external credentials/API keys or
  medical certification we cannot self-assert; they are gated behind real integrations
  (see docs/ROADMAP notes).
- Component parent-child expiry engine, PENDING_DISCARD queue, reconciliation auto-lock:
  these need new tables + a migration after user sign-off (planned for V3.4).

## 9. Live-audit hotfix (Google sign-in + cold start)

- Google sign-in is popup-first with redirect fallback; partitioned-browser
  ("missing initial state") failures now get actionable guidance.
- Bootstrap retries transport failures twice while the API wakes up.
- Verify list: sign in on a normal browser AND an in-app/private browser;
  hospital portal after API deploy; drive report per completed drive.
