BEGIN;

-- V3.3 is additive. It preserves every existing account, drive, screening,
-- registration, donation, request, inventory row, and audit event.

ALTER TABLE screenings
    ADD COLUMN IF NOT EXISTS eligible_on DATE,
    ADD COLUMN IF NOT EXISTS deferral_reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb;

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
    ON screening_review_assignments (hospital_id, status, created_at DESC);

ALTER TABLE requisition_documents
    ADD COLUMN IF NOT EXISTS ocr_status VARCHAR(32) NOT NULL DEFAULT 'NOT_PROCESSED',
    ADD COLUMN IF NOT EXISTS ocr_text_encrypted BYTEA,
    ADD COLUMN IF NOT EXISTS ocr_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS ocr_processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ocr_error_code VARCHAR(80);

ALTER TABLE blood_requests
    ADD COLUMN IF NOT EXISTS ocr_status VARCHAR(32) NOT NULL DEFAULT 'NOT_PROCESSED',
    ADD COLUMN IF NOT EXISTS ocr_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS document_date DATE,
    ADD COLUMN IF NOT EXISTS document_review_note TEXT;

CREATE TABLE IF NOT EXISTS drive_blood_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_id UUID NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
    blood_type VARCHAR(12) NOT NULL,
    max_registrations INTEGER NOT NULL CHECK (max_registrations >= 0 AND max_registrations <= 1000),
    source_request_id UUID REFERENCES blood_requests(id) ON DELETE SET NULL,
    rationale VARCHAR(240),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_drive_blood_quota UNIQUE (drive_id, blood_type)
);
CREATE INDEX IF NOT EXISTS idx_drive_quotas_active ON drive_blood_quotas (drive_id, active, blood_type);

CREATE TABLE IF NOT EXISTS blood_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_record_id UUID NOT NULL UNIQUE REFERENCES donation_records(id) ON DELETE RESTRICT,
    donor_id UUID NOT NULL REFERENCES donor_profiles(id) ON DELETE RESTRICT,
    drive_id UUID NOT NULL REFERENCES drives(id) ON DELETE RESTRICT,
    unit_reference VARCHAR(40) NOT NULL UNIQUE,
    blood_type VARCHAR(12) NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'COLLECTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blood_units_donor ON blood_units (donor_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_blood_units_drive ON blood_units (drive_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS blood_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blood_unit_id UUID NOT NULL REFERENCES blood_units(id) ON DELETE RESTRICT,
    parent_component_id UUID REFERENCES blood_components(id) ON DELETE RESTRICT,
    component_reference VARCHAR(64) NOT NULL UNIQUE,
    isbt128_code VARCHAR(64) UNIQUE,
    component_type VARCHAR(24) NOT NULL,
    blood_type VARCHAR(12) NOT NULL,
    volume_ml INTEGER CHECK (volume_ml IS NULL OR (volume_ml >= 1 AND volume_ml <= 2000)),
    collected_at TIMESTAMPTZ NOT NULL,
    prepared_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    current_hospital_id UUID REFERENCES hospital_profiles(id) ON DELETE SET NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'COLLECTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_components_expiry ON blood_components (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_components_hospital ON blood_components (current_hospital_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_components_unit ON blood_components (blood_unit_id);

CREATE TABLE IF NOT EXISTS component_shelf_life_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id uuid NOT NULL REFERENCES hospital_profiles(id) ON DELETE CASCADE,
    component_type varchar(32) NOT NULL,
    shelf_life_hours integer NOT NULL CHECK (shelf_life_hours BETWEEN 1 AND 20000),
    minimum_temperature_c numeric(5,2),
    maximum_temperature_c numeric(5,2),
    policy_reference varchar(200) NOT NULL,
    verified_by_user_id uuid NOT NULL REFERENCES users(id),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_component_policy_facility_type UNIQUE (hospital_id, component_type),
    CONSTRAINT ck_component_policy_temperature CHECK (
      minimum_temperature_c IS NULL OR maximum_temperature_c IS NULL OR minimum_temperature_c <= maximum_temperature_c
    )
);

CREATE TABLE IF NOT EXISTS component_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_id UUID NOT NULL REFERENCES blood_components(id) ON DELETE RESTRICT,
    actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    hospital_id UUID REFERENCES hospital_profiles(id) ON DELETE SET NULL,
    event_type VARCHAR(32) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    temperature_c NUMERIC(5,2),
    event_reference VARCHAR(100),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_component_events_timeline ON component_events (component_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS cold_chain_handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_id UUID NOT NULL REFERENCES blood_components(id) ON DELETE RESTRICT,
    from_hospital_id UUID REFERENCES hospital_profiles(id) ON DELETE SET NULL,
    to_hospital_id UUID REFERENCES hospital_profiles(id) ON DELETE SET NULL,
    handed_over_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    received_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    handed_over_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ,
    dispatch_temperature_c NUMERIC(5,2) NOT NULL,
    receipt_temperature_c NUMERIC(5,2),
    container_reference VARCHAR(100) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'IN_TRANSIT',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cold_chain_open ON cold_chain_handovers (status, handed_over_at DESC);
CREATE INDEX IF NOT EXISTS idx_cold_chain_component ON cold_chain_handovers (component_id, handed_over_at DESC);

CREATE TABLE IF NOT EXISTS donor_unit_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID NOT NULL REFERENCES donor_profiles(id) ON DELETE CASCADE,
    blood_unit_id UUID NOT NULL REFERENCES blood_units(id) ON DELETE CASCADE,
    component_id UUID REFERENCES blood_components(id) ON DELETE SET NULL,
    event_type VARCHAR(40) NOT NULL,
    safe_message VARCHAR(500) NOT NULL,
    delivery_status VARCHAR(32) NOT NULL DEFAULT 'IN_APP',
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_donor_unit_event UNIQUE (donor_id, component_id, event_type)
);
CREATE INDEX IF NOT EXISTS idx_donor_unit_notifications ON donor_unit_notifications (donor_id, created_at DESC);

-- Backfill an auditable unit/component foundation for any collections that
-- pre-date V3.3. Shelf-life values are policy defaults and remain visibly
-- reviewable by the receiving facility.
INSERT INTO blood_units (
    donation_record_id, donor_id, drive_id, unit_reference, blood_type,
    collected_at, status, created_at, updated_at
)
SELECT dr.id, dr.donor_id, dr.drive_id, dr.unit_reference,
       dr.blood_type_at_collection, dr.collected_at, 'COLLECTED',
       COALESCE(dr.created_at, now()), COALESCE(dr.updated_at, now())
FROM donation_records dr
ON CONFLICT (donation_record_id) DO NOTHING;

INSERT INTO blood_components (
    blood_unit_id, component_reference, component_type, blood_type, volume_ml,
    collected_at, prepared_at, expires_at, status, created_at, updated_at
)
SELECT bu.id, bu.unit_reference, dr.component_type, bu.blood_type, dr.volume_ml,
       bu.collected_at, bu.collected_at,
       bu.collected_at + CASE dr.component_type
           WHEN 'SDP' THEN INTERVAL '5 days'
           WHEN 'RDP' THEN INTERVAL '5 days'
           WHEN 'PLATELETS' THEN INTERVAL '5 days'
           WHEN 'FFP' THEN INTERVAL '365 days'
           WHEN 'CRYOPRECIPITATE' THEN INTERVAL '365 days'
           WHEN 'PRBC' THEN INTERVAL '42 days'
           ELSE INTERVAL '35 days'
       END,
       'COLLECTED', COALESCE(dr.created_at, now()), COALESCE(dr.updated_at, now())
FROM blood_units bu
JOIN donation_records dr ON dr.id = bu.donation_record_id
ON CONFLICT (component_reference) DO NOTHING;

-- Purpose-specific consent history and data-principal request workflow.
CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose_code varchar(60) NOT NULL,
  granted boolean NOT NULL,
  notice_version varchar(32) NOT NULL,
  captured_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  source varchar(24) NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consent_records_user_purpose
  ON consent_records (user_id, purpose_code, captured_at DESC);

CREATE TABLE IF NOT EXISTS data_rights_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type varchar(40) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'SUBMITTED',
  details_encrypted bytea NOT NULL,
  due_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_rights_requests_user
  ON data_rights_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_rights_requests_open
  ON data_rights_requests (status, due_at) WHERE status IN ('SUBMITTED', 'IN_REVIEW');

-- Authenticated settings persist across devices and gate privacy-sensitive alerts.
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  appearance varchar(16) NOT NULL DEFAULT 'SYSTEM' CHECK (appearance IN ('LIGHT', 'DARK', 'SYSTEM')),
  language varchar(8) NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi', 'te', 'ta', 'kn', 'ml', 'bn', 'mr')),
  in_app_notifications boolean NOT NULL DEFAULT true,
  email_notifications boolean NOT NULL DEFAULT false,
  sms_notifications boolean NOT NULL DEFAULT false,
  rare_blood_opt_in boolean NOT NULL DEFAULT false,
  location_matching_opt_in boolean NOT NULL DEFAULT true,
  donation_lifecycle_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Preserve evidence of the prior required profile consent without mislabelling it
-- as the new granular notice. Optional new channels remain disabled by default.
INSERT INTO consent_records (
  user_id, purpose_code, granted, notice_version, captured_at, source, metadata_json
)
SELECT dp.user_id, 'DONOR_REGISTRATION_AND_SAFETY', true,
       'LEGACY-MIGRATED-V3.2', COALESCE(dp.consent_at, dp.created_at),
       'MIGRATION', '{"legacy_bundled_notice": true}'::jsonb
FROM donor_profiles dp
WHERE dp.consent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM consent_records cr
    WHERE cr.user_id = dp.user_id
      AND cr.purpose_code = 'DONOR_REGISTRATION_AND_SAFETY'
  );

INSERT INTO consent_records (
  user_id, purpose_code, granted, notice_version, captured_at, source, metadata_json
)
SELECT dp.user_id, 'OPTIONAL_NEARBY_LOCATION_MATCHING', true,
       'LEGACY-MIGRATED-V3.2', COALESCE(dp.consent_at, dp.created_at),
       'MIGRATION', '{"precision_after_migration": "APPROXIMATE_2KM_GRID"}'::jsonb
FROM donor_profiles dp
WHERE dp.location IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM consent_records cr
    WHERE cr.user_id = dp.user_id
      AND cr.purpose_code = 'OPTIONAL_NEARBY_LOCATION_MATCHING'
  );

-- Reduce persisted donor coordinates to an approximate area (~2 km grid).
-- Facility and drive venue coordinates remain exact because they are public destinations.
UPDATE donor_profiles
SET location = ST_SetSRID(
    ST_SnapToGrid(location::geometry, 0.02, 0.02), 4326
)::geography
WHERE location IS NOT NULL;

DROP TRIGGER IF EXISTS trg_consent_records_updated_at ON consent_records;
CREATE TRIGGER trg_consent_records_updated_at BEFORE UPDATE ON consent_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_data_rights_requests_updated_at ON data_rights_requests;
CREATE TRIGGER trg_data_rights_requests_updated_at BEFORE UPDATE ON data_rights_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_screening_review_assignments_updated_at ON screening_review_assignments;
CREATE TRIGGER trg_screening_review_assignments_updated_at BEFORE UPDATE ON screening_review_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER trg_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_drive_blood_quotas_updated_at ON drive_blood_quotas;
CREATE TRIGGER trg_drive_blood_quotas_updated_at BEFORE UPDATE ON drive_blood_quotas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_blood_units_updated_at ON blood_units;
CREATE TRIGGER trg_blood_units_updated_at BEFORE UPDATE ON blood_units FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_blood_components_updated_at ON blood_components;
CREATE TRIGGER trg_blood_components_updated_at BEFORE UPDATE ON blood_components FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_component_shelf_life_policies_updated_at ON component_shelf_life_policies;
CREATE TRIGGER trg_component_shelf_life_policies_updated_at BEFORE UPDATE ON component_shelf_life_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_component_events_updated_at ON component_events;
CREATE TRIGGER trg_component_events_updated_at BEFORE UPDATE ON component_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_cold_chain_handovers_updated_at ON cold_chain_handovers;
CREATE TRIGGER trg_cold_chain_handovers_updated_at BEFORE UPDATE ON cold_chain_handovers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_donor_unit_notifications_updated_at ON donor_unit_notifications;
CREATE TRIGGER trg_donor_unit_notifications_updated_at BEFORE UPDATE ON donor_unit_notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
