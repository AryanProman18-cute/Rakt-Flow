-- Run on the copied Neon rehearsal branch after migration 005.
-- Read-only checks; no PII values are selected.

SELECT to_regclass('public.screening_review_assignments') AS screening_assignments,
       to_regclass('public.drive_blood_quotas') AS drive_quotas,
       to_regclass('public.blood_units') AS blood_units,
       to_regclass('public.blood_components') AS blood_components,
       to_regclass('public.component_shelf_life_policies') AS component_policies,
       to_regclass('public.component_events') AS component_events,
       to_regclass('public.cold_chain_handovers') AS cold_chain_handovers,
       to_regclass('public.donor_unit_notifications') AS donor_notifications,
       to_regclass('public.consent_records') AS consent_records,
       to_regclass('public.data_rights_requests') AS data_rights_requests,
       to_regclass('public.user_preferences') AS user_preferences;

SELECT
  (SELECT count(*) FROM donation_records) AS donation_records,
  (SELECT count(*) FROM blood_units) AS backfilled_units,
  (SELECT count(*) FROM blood_components WHERE parent_component_id IS NULL) AS root_components;

-- Expected: every historical donation has exactly one foundation unit.
SELECT count(*) AS donations_without_unit
FROM donation_records dr
LEFT JOIN blood_units bu ON bu.donation_record_id = dr.id
WHERE bu.id IS NULL;

-- Expected: zero orphan or duplicate foundation links.
SELECT donation_record_id, count(*)
FROM blood_units
GROUP BY donation_record_id
HAVING count(*) <> 1;

-- Expected: all stored donor points are aligned to the 0.02-degree grid.
SELECT count(*) AS donor_locations_not_minimized
FROM donor_profiles
WHERE location IS NOT NULL
  AND (
    abs(ST_X(location::geometry) / 0.02 - round(ST_X(location::geometry) / 0.02)) > 0.000001
    OR abs(ST_Y(location::geometry) / 0.02 - round(ST_Y(location::geometry) / 0.02)) > 0.000001
  );

-- Expected: no optional email/SMS/rare/lifecycle defaults are enabled for newly
-- materialized preference rows unless a user explicitly changed them.
SELECT count(*) AS preference_rows,
       count(*) FILTER (WHERE email_notifications) AS email_opted_in,
       count(*) FILTER (WHERE sms_notifications) AS sms_opted_in,
       count(*) FILTER (WHERE rare_blood_opt_in) AS rare_opted_in,
       count(*) FILTER (WHERE donation_lifecycle_opt_in) AS lifecycle_opted_in
FROM user_preferences;

-- Expected: no open handover has the same dispatch and receipt actor.
SELECT count(*) AS same_actor_handovers
FROM cold_chain_handovers
WHERE received_by_user_id IS NOT NULL
  AND received_by_user_id = handed_over_by_user_id;

-- Column check for OCR and deferral metadata.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'screenings' AND column_name IN ('eligible_on','deferral_reason_codes'))
    OR (table_name = 'requisition_documents' AND column_name LIKE 'ocr%')
    OR (table_name = 'blood_requests' AND column_name IN ('ocr_status','ocr_fields','document_date','document_review_note'))
  )
ORDER BY table_name, column_name;
