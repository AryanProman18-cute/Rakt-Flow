BEGIN;

CREATE TABLE user_role_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(40) NOT NULL CHECK (role IN ('ROLE_DONOR','ROLE_ORGANIZER','ROLE_HOSPITAL','ROLE_HOST_VENUE','ROLE_SUPER_ADMIN')),
    granted_by_user_id UUID REFERENCES users(id),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_role_grant UNIQUE (user_id, role)
);

-- Preserve all legacy single-role assignments as active grants.
INSERT INTO user_role_grants (user_id, role)
SELECT id, role::text FROM users
ON CONFLICT (user_id, role) DO NOTHING;

CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    invited_by_user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invitations_pending_email ON invitations (lower(email), expires_at DESC)
    WHERE status = 'PENDING';

ALTER TABLE donor_profiles
    ADD COLUMN reference_code VARCHAR(16),
    ADD COLUMN date_of_birth DATE,
    ADD COLUMN phone_encrypted TEXT,
    ADD COLUMN city VARCHAR(100),
    ADD COLUMN profile_status VARCHAR(24) NOT NULL DEFAULT 'INCOMPLETE',
    ADD COLUMN consent_at TIMESTAMPTZ,
    ADD COLUMN identity_verified_at TIMESTAMPTZ,
    ADD COLUMN identity_verified_by_user_id UUID REFERENCES users(id);

UPDATE donor_profiles
SET reference_code = 'RF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
ALTER TABLE donor_profiles ALTER COLUMN reference_code SET NOT NULL;
ALTER TABLE donor_profiles ADD CONSTRAINT uq_donor_reference_code UNIQUE (reference_code);
ALTER TABLE donor_profiles DROP CONSTRAINT IF EXISTS donor_profiles_blood_type_check;
ALTER TABLE donor_profiles ADD CONSTRAINT donor_profiles_blood_type_check
    CHECK (blood_type ~ '^(A|B|AB|O)[+-]$' OR blood_type IN ('BOMBAY','UNKNOWN'));
ALTER TABLE donor_profiles ADD CONSTRAINT donor_profile_status_check
    CHECK (profile_status IN ('INCOMPLETE','COMPLETE','SUSPENDED'));

ALTER TABLE screenings
    ADD COLUMN questionnaire_version VARCHAR(32) NOT NULL DEFAULT 'IN-PRECHECK-2026-01',
    ADD COLUMN flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN attested_at TIMESTAMPTZ;
UPDATE screenings SET attested_at = created_at WHERE attested_at IS NULL;
ALTER TABLE screenings ALTER COLUMN attested_at SET NOT NULL;
ALTER TABLE screenings DROP CONSTRAINT IF EXISTS screenings_outcome_check;
ALTER TABLE screenings ALTER COLUMN outcome TYPE VARCHAR(32);
ALTER TABLE screenings ADD CONSTRAINT screenings_outcome_check
    CHECK (outcome IN ('PROCEED_TO_CLINICAL','CLINICAL_REVIEW','TEMPORARY_DEFERRAL_SUGGESTED','DEFERRED','CLEARED_ONSITE'));

ALTER TABLE drives
    ALTER COLUMN venue_id DROP NOT NULL,
    ADD COLUMN venue_name VARCHAR(150),
    ADD COLUMN address TEXT,
    ADD COLUMN location GEOGRAPHY(POINT, 4326);
CREATE INDEX idx_drives_location ON drives USING GIST (location);

ALTER TABLE checkins
    ADD COLUMN checkin_method VARCHAR(16) NOT NULL DEFAULT 'QR';
ALTER TABLE checkins ADD CONSTRAINT checkin_method_check CHECK (checkin_method IN ('QR','MANUAL'));

CREATE TABLE clinical_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkin_id UUID UNIQUE NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    assessor_user_id UUID NOT NULL REFERENCES users(id),
    decision VARCHAR(24) NOT NULL CHECK (decision IN ('CLEARED','DEFERRED')),
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    encrypted_measurements BYTEA,
    assessed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE donation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkin_id UUID UNIQUE NOT NULL REFERENCES checkins(id),
    donor_id UUID NOT NULL REFERENCES donor_profiles(id),
    drive_id UUID NOT NULL REFERENCES drives(id),
    recorded_by_user_id UUID NOT NULL REFERENCES users(id),
    blood_type_at_collection VARCHAR(12) NOT NULL CHECK (blood_type_at_collection ~ '^(A|B|AB|O)[+-]$' OR blood_type_at_collection = 'BOMBAY'),
    component_type VARCHAR(20) NOT NULL CHECK (component_type IN ('WHOLE_BLOOD','PRBC','SDP','FFP')),
    volume_ml INTEGER CHECK (volume_ml BETWEEN 50 AND 1000),
    collected_at TIMESTAMPTZ NOT NULL,
    unit_reference VARCHAR(40) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_role_grants_active ON user_role_grants (user_id, role) WHERE revoked_at IS NULL;
CREATE INDEX idx_donor_reference_lookup ON donor_profiles (reference_code);
CREATE INDEX idx_screenings_latest ON screenings (donor_id, created_at DESC);
CREATE INDEX idx_donation_drive_time ON donation_records (drive_id, collected_at DESC);
CREATE INDEX idx_donation_donor_time ON donation_records (donor_id, collected_at DESC);

CREATE TRIGGER trg_user_role_grants_updated_at BEFORE UPDATE ON user_role_grants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invitations_updated_at BEFORE UPDATE ON invitations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clinical_assessments_updated_at BEFORE UPDATE ON clinical_assessments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_donation_records_updated_at BEFORE UPDATE ON donation_records
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
