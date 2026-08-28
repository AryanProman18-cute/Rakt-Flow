BEGIN;

CREATE TABLE hospital_profiles (
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
CREATE UNIQUE INDEX uq_hospital_registration_number ON hospital_profiles (lower(registration_number));
CREATE INDEX idx_hospital_status ON hospital_profiles (status, created_at DESC);
CREATE INDEX idx_hospital_location ON hospital_profiles USING GIST (location);

CREATE TABLE drive_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_user_id UUID NOT NULL REFERENCES users(id),
    host_email VARCHAR(255) NOT NULL,
    proposed_name VARCHAR(150) NOT NULL,
    venue_name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    target_units INTEGER NOT NULL CHECK (target_units BETWEEN 1 AND 1000),
    requirements_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','CHANGES_REQUESTED','REJECTED','WITHDRAWN')),
    responded_by_user_id UUID REFERENCES users(id),
    responded_at TIMESTAMPTZ,
    response_note TEXT,
    resulting_drive_id UUID REFERENCES drives(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX idx_proposals_organizer ON drive_proposals (organizer_user_id, created_at DESC);
CREATE INDEX idx_proposals_host ON drive_proposals (lower(host_email), status, starts_at);

CREATE TABLE blood_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospital_profiles(id) ON DELETE CASCADE,
    blood_type VARCHAR(12) NOT NULL CHECK (blood_type ~ '^(A|B|AB|O)[+-]$' OR blood_type = 'BOMBAY'),
    phenotype_code VARCHAR(64) NOT NULL DEFAULT 'STANDARD',
    component_type VARCHAR(20) NOT NULL CHECK (component_type IN ('PRBC','SDP','RDP','FFP','CRYOPRECIPITATE','WHOLE_BLOOD')),
    units_available INTEGER NOT NULL DEFAULT 0 CHECK (units_available >= 0),
    units_reserved INTEGER NOT NULL DEFAULT 0 CHECK (units_reserved >= 0 AND units_reserved <= units_available),
    minimum_level INTEGER NOT NULL DEFAULT 2 CHECK (minimum_level >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_inventory_group_component_phenotype UNIQUE (hospital_id, blood_type, component_type, phenotype_code)
);
CREATE INDEX idx_inventory_shortage ON blood_inventory (hospital_id, units_available, minimum_level);
CREATE INDEX idx_inventory_search ON blood_inventory (blood_type, component_type, units_available);

CREATE TABLE inventory_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES blood_inventory(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES hospital_profiles(id),
    actor_user_id UUID NOT NULL REFERENCES users(id),
    event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('RECEIPT','ISSUE','ADJUSTMENT','RESERVATION','RELEASE','DISCARD')),
    delta_units INTEGER NOT NULL CHECK (delta_units <> 0),
    resulting_units INTEGER NOT NULL CHECK (resulting_units >= 0),
    reference VARCHAR(100) NOT NULL,
    reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_events_hospital ON inventory_events (hospital_id, occurred_at DESC);

CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint_hash BYTEA UNIQUE NOT NULL CHECK (octet_length(endpoint_hash) = 32),
    encrypted_subscription BYTEA NOT NULL,
    user_agent VARCHAR(300),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_success_at TIMESTAMPTZ,
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_active_user ON push_subscriptions (user_id) WHERE active;

CREATE TABLE requisition_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_key VARCHAR(100) UNIQUE NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    encrypted_content BYTEA NOT NULL,
    sha256 BYTEA NOT NULL CHECK (octet_length(sha256) = 32),
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_requisition_documents_owner ON requisition_documents (hospital_user_id, created_at DESC);

ALTER TABLE blood_requests ADD COLUMN phenotype_code VARCHAR(64);
ALTER TABLE blood_requests DROP CONSTRAINT IF EXISTS blood_requests_component_type_check;
ALTER TABLE blood_requests ADD CONSTRAINT blood_requests_component_type_check
    CHECK (component_type IN ('PRBC','SDP','RDP','FFP','CRYOPRECIPITATE','WHOLE_BLOOD'));
CREATE UNIQUE INDEX uq_blood_requests_document_key ON blood_requests (document_object_key);

CREATE TRIGGER trg_hospital_profiles_updated_at BEFORE UPDATE ON hospital_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_drive_proposals_updated_at BEFORE UPDATE ON drive_proposals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_blood_inventory_updated_at BEFORE UPDATE ON blood_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inventory_events_updated_at BEFORE UPDATE ON inventory_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_push_subscriptions_updated_at BEFORE UPDATE ON push_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_requisition_documents_updated_at BEFORE UPDATE ON requisition_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
