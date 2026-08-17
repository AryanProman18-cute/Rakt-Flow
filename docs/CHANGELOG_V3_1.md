# RaktFlow V3.1 changelog

## Authentication

- Replaced the public passwordless-link form with email/password sign-in.
- Added donor/account registration with password confirmation.
- Added one-time email verification before backend account bootstrap.
- Added password-reset requests for forgotten passwords and migration of older passwordless accounts.
- Retained Google sign-in.
- Retained same-device completion for passwordless links issued by the previous version during the transition.
- Added neutral credential errors and non-enumerating password-reset confirmation.
- Kept passwords entirely inside Firebase Authentication; FastAPI and PostgreSQL never receive or store passwords.

## Authorization invariants

- New uninvited verified accounts still default to `ROLE_DONOR` at `/api/v1/auth/bootstrap`.
- Staff roles remain invitation-only.
- Super Admin bootstrap remains bound to the server-side `BOOTSTRAP_ADMIN_EMAIL`.
- Multiple roles remain server-managed through PostgreSQL grants and Firebase custom claims.

## Interface

- Preserved the V3 design.
- Added accessible sign-in, registration, and recovery forms with browser autocomplete metadata.
- Added clear verification, recovery, throttling, popup, and network messages.
- Removed the language selector from the unauthenticated landing/sign-in experience; authenticated screens retain language selection.

## Engineering

- Added `frontend/src/auth.test.js` with authentication-message tests.
- Added ESLint and `frontend/eslint.config.js`.
- Removed one unused helper and one duplicate object key identified by linting.
- Corrected `CORS_ORIGINS` examples to use Pydantic-compatible JSON-list syntax.
- No database migration and no FastAPI route change are required.
