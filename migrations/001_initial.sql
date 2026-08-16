BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE user_role AS ENUM ('ROLE_DONOR', 'ROLE_HOSPITAL', 'ROLE_ORGANIZER', 'ROLE_HOST_VENUE');
CREATE TYPE urgency_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL_PPH', 'RARE_STANDBY');
CREATE TYPE verification_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'RESOLVED', 'EXPIRED');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE donor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    blood_type VARCHAR(12) NOT NULL CHECK (blood_type ~ '^(A|B|AB|O)[+-]$' OR blood_type = 'BOMBAY'),
    phenotype_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    phone_hash BYTEA UNIQUE NOT NULL CHECK (octet_length(phone_hash) = 32),
    last_donation_date DATE,
    is_apheresis_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    is_on_call_standby BOOLEAN NOT NULL DEFAULT FALSE,
    eligibility_until TIMESTAMPTZ,
    location GEOGRAPHY(POINT, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id),
    facility_name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE drives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_user_id UUID NOT NULL REFERENCES users(id),
    venue_id UUID NOT NULL REFERENCES venues(id),
    name VARCHAR(150) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    target_units INTEGER NOT NULL DEFAULT 50 CHECK (target_units BETWEEN 1 AND 10000),
    status VARCHAR(24) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','APPROVED','ACTIVE','COMPLETED','CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE TABLE screenings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID NOT NULL REFERENCES donor_profiles(id) ON DELETE CASCADE,
    encrypted_answers BYTEA NOT NULL,
    outcome VARCHAR(24) NOT NULL CHECK (outcome IN ('PROCEED_TO_CLINICAL','CLINICAL_REVIEW','DEFERRED','CLEARED_ONSITE')),
    valid_until TIMESTAMPTZ NOT NULL,
    reviewed_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_id UUID NOT NULL REFERENCES drives(id),
    donor_id UUID NOT NULL REFERENCES donor_profiles(id),
    scanner_user_id UUID NOT NULL REFERENCES users(id),
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    scanned_at TIMESTAMPTZ NOT NULL,
    clearance_status VARCHAR(24) NOT NULL CHECK (clearance_status IN ('PENDING_REVIEW','CLEARED','DEFERRED')),
    source VARCHAR(20) NOT NULL DEFAULT 'ONLINE' CHECK (source IN ('ONLINE','OFFLINE_REPLAY')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE blood_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_user_id UUID NOT NULL REFERENCES users(id),
    patient_reference_hash BYTEA NOT NULL CHECK (octet_length(patient_reference_hash) = 32),
    blood_type VARCHAR(12) NOT NULL CHECK (blood_type ~ '^(A|B|AB|O)[+-]$' OR blood_type = 'BOMBAY'),
    component_type VARCHAR(20) NOT NULL CHECK (component_type IN ('PRBC','SDP','FFP','WHOLE_BLOOD')),
    units_needed INTEGER NOT NULL CHECK (units_needed BETWEEN 1 AND 20),
    urgency urgency_level NOT NULL DEFAULT 'MEDIUM',
    document_object_key TEXT NOT NULL,
    document_sha256 BYTEA NOT NULL CHECK (octet_length(document_sha256) = 32),
    status verification_status NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMPTZ NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    verified_by_user_id UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at),
    CHECK ((status <> 'VERIFIED') OR (verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL)),
    CHECK ((status <> 'RESOLVED') OR resolved_at IS NOT NULL)
);

CREATE TABLE donor_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES donor_profiles(id),
    tier INTEGER NOT NULL CHECK (tier IN (1, 2)),
    radius_km INTEGER NOT NULL CHECK (radius_km IN (15, 30)),
    response VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (response IN ('PENDING','ACCEPTED','DECLINED','EXPIRED')),
    response_deadline TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (request_id, donor_id)
);

CREATE TABLE dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES blood_requests(id),
    kind VARCHAR(24) NOT NULL CHECK (kind IN ('PPH','RARE_TRANSFER','INTERFACILITY')),
    clinical_owner_user_id UUID NOT NULL REFERENCES users(id),
    courier_user_id UUID REFERENCES users(id),
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVATED' CHECK (status IN ('ACTIVATED','ACKNOWLEDGED','UNITS_RELEASED','EN_ROUTE','DELIVERED','CANCELLED')),
    target_arrival_at TIMESTAMPTZ NOT NULL,
    last_location GEOGRAPHY(POINT, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (request_id, kind)
);

CREATE TABLE platelet_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID NOT NULL REFERENCES donor_profiles(id),
    group_code VARCHAR(8) NOT NULL CHECK (group_code IN ('A','B','C')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED','CONFIRMED','DECLINED','CALLED','COMPLETED','EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    UNIQUE (donor_id, starts_at)
);

CREATE TABLE notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic VARCHAR(100) NOT NULL,
    event_type VARCHAR(60) NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    available_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL,
    actor_uid VARCHAR(128) NOT NULL,
    action VARCHAR(80) NOT NULL,
    resource_type VARCHAR(40) NOT NULL,
    resource_id UUID,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash BYTEA,
    event_hash BYTEA NOT NULL CHECK (octet_length(event_hash) = 32)
);

-- Spatial and operational indexes are deliberately narrow for the free-tier footprint.
CREATE INDEX idx_donors_location ON donor_profiles USING GIST (location);
CREATE INDEX idx_donors_rare_ready ON donor_profiles (blood_type, eligibility_until)
    WHERE is_on_call_standby AND blood_type IN ('O-','A-','B-','AB-','BOMBAY');
CREATE INDEX idx_donors_apheresis ON donor_profiles (eligibility_until, last_donation_date)
    WHERE is_apheresis_eligible;
CREATE INDEX idx_venues_location ON venues USING GIST (location);
CREATE INDEX idx_requests_location ON blood_requests USING GIST (location);
CREATE INDEX idx_requests_active ON blood_requests (status, expires_at)
    WHERE status IN ('PENDING','VERIFIED');
CREATE INDEX idx_requests_hospital ON blood_requests (hospital_user_id, created_at DESC);
CREATE INDEX idx_alerts_response_window ON donor_alerts (request_id, response, response_deadline);
CREATE INDEX idx_checkins_drive ON checkins (drive_id, scanned_at DESC);
CREATE INDEX idx_platelet_windows_active ON platelet_windows (starts_at, status)
    WHERE status IN ('OFFERED','CONFIRMED','CALLED');
CREATE INDEX idx_outbox_pending ON notification_outbox (available_at)
    WHERE published_at IS NULL;
CREATE INDEX idx_audit_resource ON audit_events (resource_type, resource_id, occurred_at DESC);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;

DO $$ DECLARE table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['users','donor_profiles','venues','drives','screenings','checkins','blood_requests','donor_alerts','dispatches','platelet_windows','notification_outbox']
    LOOP
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name, table_name);
    END LOOP;
END $$;

-- Called by a trusted scheduled job. Expiry first revokes the request, then its pending alerts.
CREATE FUNCTION expire_stale_requests() RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE affected INTEGER;
BEGIN
    UPDATE blood_requests SET status = 'EXPIRED'
    WHERE status IN ('PENDING','VERIFIED') AND expires_at <= now();
    GET DIAGNOSTICS affected = ROW_COUNT;
    UPDATE donor_alerts SET response = 'EXPIRED'
    WHERE response = 'PENDING'
      AND (response_deadline <= now() OR request_id IN (SELECT id FROM blood_requests WHERE status = 'EXPIRED'));
    RETURN affected;
END $$;

-- Audit records are append-only for the application role.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only';
END $$;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

COMMIT;
