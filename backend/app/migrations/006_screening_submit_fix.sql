-- V3.3.1 Hotfix 9: bring the screenings table up to the current model.
-- Idempotent by design (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS), so it is
-- safe whether or not migrations 002/004/005 were previously applied, and safe
-- to re-run on any database. Standalone: only touches the screenings table,
-- so it applies even when unrelated migrations (002/003/005) cannot run.

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE screenings
    ADD COLUMN IF NOT EXISTS questionnaire_version VARCHAR(32) NOT NULL DEFAULT 'IN-PRECHECK-2026-02',
    ADD COLUMN IF NOT EXISTS flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS review_note TEXT,
    ADD COLUMN IF NOT EXISTS eligible_on DATE,
    ADD COLUMN IF NOT EXISTS deferral_reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE screenings SET attested_at = created_at WHERE attested_at IS NULL;
ALTER TABLE screenings ALTER COLUMN attested_at SET NOT NULL;

ALTER TABLE screenings DROP CONSTRAINT IF EXISTS screenings_outcome_check;
ALTER TABLE screenings ALTER COLUMN outcome TYPE VARCHAR(32);
ALTER TABLE screenings ADD CONSTRAINT screenings_outcome_check
    CHECK (outcome IN ('PROCEED_TO_CLINICAL','CLINICAL_REVIEW','TEMPORARY_DEFERRAL_SUGGESTED','DEFERRED','CLEARED_ONSITE'));

ALTER TABLE screenings DROP CONSTRAINT IF EXISTS screenings_review_status_check;
ALTER TABLE screenings ADD CONSTRAINT screenings_review_status_check
    CHECK (review_status IN ('PENDING','APPROVED','DECLINED'));

CREATE INDEX IF NOT EXISTS idx_screenings_latest
    ON screenings (donor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenings_review_queue
    ON screenings (review_status, created_at DESC);
