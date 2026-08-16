# Specification traceability

Source: `Raktflow.pdf` (14 pages). This matrix records where each major requirement is represented and prevents the visual prototype from being mistaken for completed production integration.

| Requirement | Prototype | Backend / infrastructure | Status |
|---|---|---|---|
| Slate / Rose / Zinc light and dark tokens | `frontend/src/styles.css` | Firebase CSP/headers | Implemented |
| Emergency pulse, hover elevation, shimmer, modal transition | CSS keyframes and interactive cards | — | Implemented with reduced-motion fallback |
| WCAG focus, semantics, contrast-oriented hierarchy | skip link, focus rings, dialog focus trap, labels | — | Implemented baseline; formal audit pending |
| Neon pool capped at 5 | — | `core/database.py` | Implemented correctly against pooled PostgreSQL endpoint |
| Offline shell and check-in replay | status UI, offline simulation | `sw.js`, `offline-db.js`, idempotent batch route | Scaffold; production replay credential and E2E tests pending |
| Firebase magic link and Google | adapter source | Firebase token verification and custom roles | Implemented adapter; demo shell intentionally uses seeded role preview |
| Web Push / Firestore | notification UX | recipient rules, transactional outbox publisher | Scaffold; worker deployment and push subscriptions pending |
| Cold-start hover ping | priority controls use `data-warm` | `HEAD /ping`, optional workflow | Implemented; no SLA claim |
| Rare 15 km → 30 km pager | donor/hospital pager views | PostGIS query, 3–5 cap, 10-minute guard, one expansion | Core implemented; response endpoint/cooldowns pending |
| Anti-noise verification | requisition modal/tracker/reviewer cues | PENDING→VERIFIED/REJECTED, private object metadata, expiry SQL, outbox | Core implemented; production object adapter/OCR UI pending |
| 3-day platelet pipeline | donor standby window and hospital module | deterministic A/B/C scheduler with 14-day filter | Core implemented; policy versioning/inventory integration pending |
| PPH maternity bridge | protected confirmation, timeline, route/ETA | verified request guard, one dispatch, 2-hour target, audit/outbox | Core implemented; courier/ack state routes pending |
| D-1 donor dashboard | full responsive page | donor profile/pass foundations | Implemented |
| D-2 screening wizard | four-step accessible dialog and result | screening model | Prototype implemented; encrypted submission endpoint pending |
| D-3 dynamic QR pass | real generated rotating QR/code and offline label | signed token issuer | Implemented baseline; device-bound offline envelope pending |
| O-1 command center | KPIs, intake, stations, sync | drive/check-in models | Implemented visual |
| O-2 scanner and verification | scanner reticle, lookup, intake actions | idempotent online/batch endpoints | Implemented baseline; camera and pass-validation endpoint pending |
| O-3 reconciliation/certificates | reconciliation and batch action | collection/certificate worker not yet built | Visual only |
| H-1 operations dashboard | inventory grid and regional map | blood-request model/spatial support | Implemented visual; inventory integration pending |
| H-2 requisition builder | complete form, upload desk, live tracker | create/review/resolve routes | Core implemented |
| H-3 PPH and rare console | protected action, transit panel, rare pager | logistics routes | Core implemented |
| I-1 proposal and approval | proposal list/review and logistics checklist | venue model only | Visual; proposal API pending |
| I-2 promotion builder | co-branded URL and poster preview | — | Visual; asset worker pending |
| I-3 analytics and ESG | de-identified KPI/chart/report action | — | Visual; aggregate query/report worker pending |

## Deliberate corrections to the source specification

1. **Neon transport:** asyncpg uses PostgreSQL/TCP. The code uses Neon's pooled endpoint; it does not claim to combine asyncpg with a separate HTTP transaction driver.
2. **Clinical verification:** parsing a slip, matching an IP range, or recognizing a physician name cannot safely authorize a request. Automation may pre-fill; an authorized human changes state.
3. **“Universal donor” phrasing:** RaktFlow mobilizes logistics but never issues a transfusion instruction. Compatibility and emergency release remain under blood-bank/clinical SOPs.
4. **Passkeys:** the source simultaneously requires Firebase magic-link/Google-only auth and hospital WebAuthn. The baseline implements the former and documents passkey step-up as a separate reviewed integration rather than pretending Firebase provides it automatically.
5. **Document persistence:** a Render container filesystem is ephemeral and inappropriate for requisitions. Production upload fails closed until a private durable object-store adapter is configured.
6. **Free-tier reliability:** optional probes may reduce some cold starts but cannot guarantee an always-on emergency service and may be constrained by current vendor terms. The documentation requires a paid reliability plan before clinical use.
7. **Screening language:** self-reported answers produce “proceed to on-site assessment,” not a medical clearance token.
