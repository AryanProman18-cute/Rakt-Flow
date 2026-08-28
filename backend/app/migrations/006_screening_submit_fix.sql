-- V3.3.1 Hotfix 9: bring the screenings/review schema up to the current model.
-- Idempotent by design (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS), so it is
-- safe whether or not migrations 002/004/005 were previously applied, and safe
-- to re-run on any database.

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

-- Self-sufficiency guard: the submit path can create a screening review
-- assignment referencing hospital_profiles. If migration 003 has not been
-- applied yet (or rolled back), ensure the table exists anyway. Matches
-- migrations/003 exactly, and IF NOT EXISTS makes it a no-op where 003 ran.
CREATE TABLE IF NOT EXISTS hospital_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_name VARCHAR(180) NOT NULL,
    registration_number VARCHAR(100) NOT NULL,
    institutional_email VARCHAR(255) NOT NULL,
    phone_encrypted TEXT,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    location GEOGRAPHY(POINT, 4326),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED','SUSPENDED')),
    verified_by_user_id UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hospital_registration_number ON hospital_profiles (lower(registration_number));
CREATE INDEX IF NOT EXISTS idx_hospital_status ON hospital_profiles (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hospital_location ON hospital_profiles USING GIST (location);

CREATE TABLE IF NOT EXISTS screening_review_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_id UUID NOT NULL UNIQUE REFERENCES screenings(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES hospital_profiles(id) ON DELETE RESTRICT,
    selected_by_donor_at TIMESTAMPTZ NOT NULL,
    purpose_consent_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_screening_review_assignment_queue
    ON screening_review_assignments (status, created_at DESC);
