BEGIN;

-- A donor pre-check is never enough to issue a QR pass. A verified Hospital-role
-- reviewer must explicitly approve QR eligibility; final on-site clearance is
-- still recorded separately against the drive check-in.
ALTER TABLE screenings
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE screenings DROP CONSTRAINT IF EXISTS screenings_review_status_check;
ALTER TABLE screenings ADD CONSTRAINT screenings_review_status_check
    CHECK (review_status IN ('PENDING','APPROVED','DECLINED'));
CREATE INDEX IF NOT EXISTS idx_screenings_review_queue
    ON screenings (review_status, created_at DESC);

-- Persist provider delivery state so Super Admin can distinguish pending access
-- from an invitation whose email was sent, failed, or is not configured.
ALTER TABLE invitations
    ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(40) NOT NULL DEFAULT 'NOT_SENT',
    ADD COLUMN IF NOT EXISTS delivery_provider_id VARCHAR(160),
    ADD COLUMN IF NOT EXISTS last_delivery_at TIMESTAMPTZ;

-- Customizable organizer campaigns backed by an approved/active drive.
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_id UUID NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
    organizer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug VARCHAR(80) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    poster_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT campaigns_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_slug_lower ON campaigns (lower(slug));
CREATE INDEX IF NOT EXISTS idx_campaigns_drive ON campaigns (drive_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON campaigns (organizer_user_id, created_at DESC);

-- Unique, privacy-preserving visit counts. visitor_hash is a one-way keyed hash
-- of a browser-generated random identifier; no IP address is stored.
CREATE TABLE IF NOT EXISTS campaign_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    visitor_hash BYTEA NOT NULL CHECK (octet_length(visitor_hash) = 32),
    first_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    visit_count INTEGER NOT NULL DEFAULT 1 CHECK (visit_count > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_campaign_visitor UNIQUE (campaign_id, visitor_hash)
);
CREATE INDEX IF NOT EXISTS idx_campaign_visits_campaign ON campaign_visits (campaign_id, first_visited_at DESC);

-- Real donor registrations replace seeded attendance rows.
CREATE TABLE IF NOT EXISTS drive_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_id UUID NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES donor_profiles(id) ON DELETE CASCADE,
    source_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REGISTERED'
        CHECK (status IN ('REGISTERED','CHECKED_IN','CANCELLED')),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_drive_registration UNIQUE (drive_id, donor_id)
);
CREATE INDEX IF NOT EXISTS idx_drive_registrations_drive ON drive_registrations (drive_id, status, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_registrations_donor ON drive_registrations (donor_id, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_registrations_campaign ON drive_registrations (source_campaign_id) WHERE source_campaign_id IS NOT NULL;

-- Encrypted facility evidence lets Super Admin review licence/registration
-- documents without exposing them through public or operational list APIs.
CREATE TABLE IF NOT EXISTS hospital_application_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospital_profiles(id) ON DELETE CASCADE,
    uploader_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_kind VARCHAR(40) NOT NULL DEFAULT 'REGISTRATION_EVIDENCE',
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    encrypted_content BYTEA NOT NULL,
    sha256 BYTEA NOT NULL CHECK (octet_length(sha256) = 32),
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hospital_application_documents
    ON hospital_application_documents (hospital_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_hospital_application_documents_updated_at ON hospital_application_documents;
CREATE TRIGGER trg_hospital_application_documents_updated_at BEFORE UPDATE ON hospital_application_documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_campaign_visits_updated_at ON campaign_visits;
CREATE TRIGGER trg_campaign_visits_updated_at BEFORE UPDATE ON campaign_visits
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_drive_registrations_updated_at ON drive_registrations;
CREATE TRIGGER trg_drive_registrations_updated_at BEFORE UPDATE ON drive_registrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
