-- V3.3.1 Hotfix 11: auto-assigned review facilities have no donor selection.
--
-- When a donor does not pick a hospital, the API assigns verified facilities
-- nearest to the donor and leaves selected_by_donor_at / purpose_consent_at
-- empty (NULL) -- there was no donor selection and no facility-specific
-- consent. The table declared both columns NOT NULL, so every auto-assigned
-- submit failed with an IntegrityError -> HTTP 500 -> "The action could not
-- be completed" toast in the app.
--
-- Fix: allow NULL. Donor-selected facilities still record both timestamps.
-- Idempotent: DROP NOT NULL on an already-nullable column is a no-op.

ALTER TABLE screening_review_assignments
    ALTER COLUMN selected_by_donor_at DROP NOT NULL,
    ALTER COLUMN purpose_consent_at DROP NOT NULL;
