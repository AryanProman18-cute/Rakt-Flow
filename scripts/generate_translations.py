"""Build static locale files. Used only during development; the PWA has no translation API dependency."""

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "frontend/src/main.js").read_text()
keys = set(re.findall(r"['\"]([a-zA-Z]+\.[a-zA-Z0-9.]+)['\"]", SOURCE))
status_values = [
    "active", "approved", "cancelled", "checked_in", "changes_requested", "cleared", "completed",
    "declined", "deferred", "disabled", "draft", "failed", "high", "low", "medium", "not_checked_in",
    "accepted", "expired", "not_sent", "pending", "pending_review", "planned", "published", "registered", "rejected", "resolved", "sent", "unknown",
    "verified", "walk_in", "proceed_to_clinical", "clinical_review", "temporary_deferral_suggested",
    "age_requires_review", "weight_below_configured_threshold", "current_health_requires_review",
    "medication_requires_review", "medical_history_requires_review", "recent_procedure_requires_review",
    "recent_tattoo_piercing_requires_review", "travel_requires_review", "pregnancy_related_review",
    "recent_donation_requires_review", "role_donor", "role_organizer", "role_hospital", "role_host_venue",
    "role_super_admin", "email_provider_not_configured",
]
keys.update(f"status.{value}" for value in status_values)


def humanize(key: str) -> str:
    value = key.rsplit(".", 1)[-1]
    value = re.sub(r"(?<!^)([A-Z])", r" \1", value).replace("_", " ")
    return value[:1].upper() + value[1:]


EN = {key: humanize(key) for key in keys}


def add(prefix: str, values: dict[str, str]) -> None:
    EN.update({f"{prefix}.{key}": value for key, value in values.items()})


add("common", {
    "actions":"Actions", "address":"Address", "approve":"Approve", "bloodGroup":"Blood group", "browse":"Browse",
    "cancel":"Cancel", "city":"City or district", "close":"Close", "completeProfile":"Complete profile", "component":"Component",
    "confirm":"Confirm", "date":"Date", "decline":"Decline", "donor":"Donor", "drive":"Drive", "driveName":"Drive name",
    "edit":"Edit", "editProfile":"Edit profile", "email":"Email", "ends":"Ends", "expires":"Expires", "findDrive":"Find a drive",
    "language":"Language", "latitude":"Latitude", "longitude":"Longitude", "manage":"Manage", "menu":"Menu", "name":"Name",
    "no":"No", "none":"None", "notApplicable":"Not applicable", "notSent":"Not sent", "notSet":"Not set", "note":"Decision note",
    "phone":"Phone number", "profile":"Profile", "reference":"Reference", "refresh":"Refresh", "reject":"Reject", "roles":"Roles",
    "save":"Save", "select":"Select", "send":"Send", "sent":"Sent", "signOut":"Sign out", "start":"Start", "starts":"Starts",
    "state":"State", "status":"Status", "submit":"Submit", "target":"Target units", "theme":"Theme", "unitReference":"Unit reference",
    "units":"units", "useLocation":"Use current location", "venue":"Venue", "verify":"Verify", "view":"View", "volume":"Volume", "yes":"Yes",
})
add("role", {"donor":"Donor", "organizer":"Organizer", "hospital":"Hospital / blood bank", "venue":"Host venue", "admin":"Super Admin"})
add("nav", {
    "home":"Home", "drives":"Find drives", "needs":"Verified needs", "history":"Donation history", "pass":"Donor QR pass",
    "overview":"Overview", "manageDrives":"Manage drives", "campaigns":"Campaign builder", "intake":"QR intake", "roster":"Donor register",
    "reconciliation":"Reconciliation", "clinicalReview":"Clinical review", "inventory":"Blood inventory", "requests":"Blood requests",
    "proposals":"Drive proposals", "impact":"Impact", "users":"Users", "invitations":"Invitations", "hospitals":"Hospital applications",
    "driveApprovals":"Drive approvals", "platformData":"Platform data", "audit":"Audit trail",
})
add("app", {"currentWorkspace":"Current workspace", "secureSession":"Secure verified session", "verifiedNetwork":"Verified logistics network"})
add("loading", {
    "title":"Preparing your workspace", "connecting":"Connecting securely…", "signingIn":"Verifying your identity…",
    "workspace":"Loading roles and operational records…", "refreshing":"Refreshing current records…",
    "note":"This can take a little longer while a free Render service wakes up.",
})
add("footer", {"madeInIndia":"Made with care in India"})
add("account", {"title":"Your account", "serverRoles":"These permissions are controlled by the RaktFlow server."})
add("profile", {
    "subtitle":"Contact details are encrypted or tokenized at rest.", "birthDate":"Date of birth", "unknownBlood":"Unknown / not confirmed",
    "bloodNotice":"Choose a self-reported group only if you know it. Collection-time testing remains mandatory.",
    "locationNotice":"Your coordinates are used to show only nearby verified centres, drives and needs.",
    "consent":"I consent to these details being processed for donor registration and authorized blood-logistics communication.",
})
add("map", {
    "nearbyTitle":"Nearby verified network", "nearbySubtitle":"Embedded 100 km view based on the location in your donor profile.",
    "empty":"No verified location is available nearby yet.", "drive":"Drive", "centre":"Verified centre", "need":"Verified need",
    "kilometres":"km",
})
add("donor", {
    "homeTitle":"Your donor journey", "homeSubtitle":"Complete each real step and follow your verified registrations.",
    "stepProfile":"Complete your donor profile", "profileComplete":"Profile complete", "profileMissing":"Name, birth date, phone, city, location and blood group are required.",
    "stepPrecheck":"Submit the private health pre-check", "precheckMissing":"No current pre-check has been submitted.",
    "stepPass":"Receive reviewer approval for QR", "passReady":"An authorized reviewer approved the current pre-check.",
    "passLocked":"QR remains locked until the latest pre-check is approved.", "precheckAction":"Health pre-check", "showPass":"Show donor pass",
    "upcomingRegistrations":"Your drive registrations", "upcomingRegistrationsHelp":"Confirmed registrations from the operational database.",
    "noRegistrations":"No drive registration yet", "noRegistrationsHelp":"Browse approved drives and register securely.",
    "profileSummary":"Profile summary", "profileSummaryHelp":"Self-reported details; not laboratory confirmation.",
    "liveNeeds":"Verified blood needs", "liveNeedsHelp":"Only active requests from verified facilities.", "verifiedNeedsCount":"active verified needs",
    "registerNow":"Register for this drive", "drivesTitle":"Approved donation drives", "drivesSubtitle":"Real organizer schedules approved for donor registration.",
    "noDrives":"No approved drive is open", "noDrivesHelp":"Check again after an organizer and Super Admin publish a schedule.",
    "needsTitle":"Verified blood needs", "needsSubtitle":"No patient identity is displayed. Respond only through authorized channels.",
    "noNeeds":"No verified need is active", "noNeedsHelp":"Expired and resolved requests are automatically removed.",
    "historyTitle":"Your donation history", "historySubtitle":"Only clinically cleared and recorded collections appear here.",
    "noHistory":"No recorded donation yet", "noHistoryHelp":"A record appears after on-site clearance and collection.",
    "passTitle":"Protected donor QR pass", "passSubtitle":"The QR contains an opaque signed identifier, not personal or health details.",
    "generatePass":"Generate rotating pass", "passApproved":"QR eligibility approved", "passSafety":"Final on-site identity, health and collection checks are still mandatory.",
    "passNotReady":"Your pass is still locked", "passRequirements":"Complete the profile, choose a blood group, submit the questionnaire and wait for reviewer approval.",
    "qrOpaque":"Authorized staff exchange this opaque token for minimum intake information.",
})
add("screening", {
    "title":"India-focused donor pre-check", "subtitle":"Self-attestation routes qualified review; it never clears a donation.",
    "noticeTitle":"Answer privately and honestly.", "noticeBody":"Qualified staff will still verify identity, donation interval, hemoglobin, vital signs and confidential history.",
    "weight":"Current weight in kilograms", "lastDonation":"Last donation date, if any", "feelingWell":"Are you feeling well today?",
    "infection":"Do you have fever, infection or current antibiotics?", "medication":"Are you taking medicine that needs review?",
    "conditions":"Any heart, lung, kidney, liver or bleeding condition?", "procedure":"Surgery, transfusion or hospitalization in the last 12 months?",
    "tattoo":"Tattoo or piercing in the last 12 months?", "travel":"Recent residence or travel with malaria risk?",
    "pregnancy":"Pregnancy, breastfeeding or recent delivery requiring review?", "truth":"I confirm these answers are truthful.",
    "reviewConsent":"I consent to confidential review by authorized clinical staff.", "submit":"Submit encrypted pre-check",
})
add("organizer", {
    "overviewTitle":"Organizer operations", "overviewSubtitle":"Create approved schedules and operate real donor intake.",
    "createDrive":"Create a drive", "createDriveHelp":"Creates a Planned drive that becomes public only after Super Admin approval.",
    "proposeDrive":"Propose to a host venue", "proposeDriveHelp":"Sends a proposal to a Host Venue account; host approval creates an Approved drive.",
    "totalDrives":"Total drives", "registrations":"Registrations", "checkins":"Check-ins", "unitsLogged":"Units logged",
    "activeDrive":"Selected drive", "activeDriveHelp":"All roster and reconciliation figures come from this drive.",
    "approvalNotice":"Planned drives are not visible to donors until Super Admin approval.", "noDrives":"No drive created",
    "noDrivesHelp":"Create a direct drive or send a proposal to a host venue.", "drivesTitle":"Drive management",
    "drivesSubtitle":"Create, monitor and advance authorized drive states.", "startDrive":"Start drive", "completeDrive":"Complete drive",
})
add("campaign", {
    "title":"Campaign promotion builder", "subtitle":"Create a working registration link, editable poster and measurable campaign.",
    "create":"Create campaign", "edit":"Edit campaign", "empty":"No campaign created", "emptyHelp":"Create one for an existing drive, then publish after drive approval.",
    "preview":"Editable poster preview", "previewHelp":"Downloadable SVG assets use your real drive information.",
    "realMetrics":"Real campaign metrics", "realMetricsHelp":"Unique privacy-safe visits and verified registrations from the database.",
    "visitors":"Unique visitors", "registrations":"Registrations", "conversion":"Conversion", "publish":"Publish campaign",
    "copyLink":"Copy registration link", "downloadQr":"Download link QR", "downloadPoster":"Download poster", "email":"Send by email",
    "formHelp":"Customize the link and poster. User-created content is displayed as entered.", "slug":"Custom link name",
    "campaignTitle":"Campaign title", "description":"Campaign description", "headline":"Poster headline", "subheading":"Poster subheading",
    "organizerName":"Organizer name", "callToAction":"Call-to-action text", "color":"Accent color", "register":"Register securely",
    "driveRequired":"Create a drive before creating a campaign.", "emailHelp":"The configured email service delivers the real registration link from your verified sender domain.",
    "recipient":"Recipient email", "personalMessage":"Optional personal message", "invitationReady":"Drive invitation ready",
    "invitationReadyHelp":"Complete your profile, then confirm registration for the invited drive.",
})
add("intake", {
    "title":"Authorized donor intake", "subtitle":"Scan a rotating pass, upload a QR photo, or use an audited donor reference.",
    "cameraPrivacy":"Camera frames remain on this device; only the decoded token is submitted.", "openCamera":"Open camera",
    "scanPhoto":"Scan QR from photo", "manualReference":"Manual donor reference", "checkIn":"Check in", "approvedDriveRequired":"Select an Approved or Active drive first.",
    "donorCard":"Donor intake card", "donorCardHelp":"Minimum authorized details returned after a valid check-in.", "ready":"Ready for a donor",
    "readyHelp":"Use the camera, a QR image, or the donor reference.", "precheck":"Pre-check", "clearance":"On-site clearance",
    "assess":"Record clinical assessment", "assessHelp":"Qualified Hospital-role staff only. Measurements are encrypted.",
    "recordDonation":"Record collected unit", "recordDonationHelp":"Available only after a qualified on-site clearance.",
    "selectDrive":"Select a drive before scanning.", "secureCamera":"Camera access requires HTTPS and a supported browser.",
    "cameraPermission":"Camera permission was denied or no camera is available.", "holdQr":"Hold the donor QR inside the camera view.",
    "noQrFound":"No readable RaktFlow QR was found.", "decision":"Decision", "reasonCodes":"Reason codes", "hemoglobin":"Hemoglobin g/dL",
    "pulse":"Pulse bpm", "systolic":"Systolic blood pressure", "diastolic":"Diastolic blood pressure",
})
add("roster", {
    "title":"Real donor register", "subtitle":"Drive registrations, check-ins, clearance and units from PostgreSQL.", "registration":"Registration",
    "checkin":"Check-in", "clearance":"Clearance", "unit":"Collected unit", "empty":"No donor in this drive yet",
    "emptyHelp":"Registered donors and audited walk-ins appear here.",
})
add("reconcile", {
    "title":"Post-drive reconciliation", "subtitle":"Actual collected units and conversion totals for the selected drive.",
    "cleared":"Cleared", "empty":"No collected unit recorded", "emptyHelp":"A row appears only after check-in, clinical clearance and collection recording.",
})
add("hospital", {
    "overviewTitle":"Hospital and blood-bank operations", "overviewSubtitle":"Facility verification, clinical review, inventory and demands.",
    "apply":"Apply as a hospital or blood bank", "applicationHelp":"The application is stored for Super Admin review and a notification is sent to the configured administrator email.",
    "facility":"Facility", "facilityName":"Facility name", "registrationNumber":"Registration or licence number", "institutionalEmail":"Institutional email",
    "pendingNotice":"Operations remain locked until Super Admin verification.", "noApplication":"No facility application", "noApplicationHelp":"Submit real facility details for review.",
    "pendingReviews":"Pending reviews", "inventoryUnits":"Inventory units", "activeRequests":"Active requests",
    "evidence":"Registration or licence evidence", "evidenceHelp":"Upload a signed PDF, JPG or PNG for encrypted Super Admin review.",
    "documentsStored":"evidence documents stored", "addEvidence":"Add evidence", "reviewEvidence":"Review evidence",
    "reviewEvidenceHelp":"Encrypted application evidence is available only to the applicant and Super Admin.",
    "noEvidence":"No evidence document", "noEvidenceHelp":"Do not verify this facility until required evidence has been supplied.",
    "evidenceRetry":"The application was stored, but evidence upload did not finish. Use Add evidence to retry.",
    "verificationRequired":"Verified facility required", "verificationRequiredHelp":"Super Admin must verify this facility before inventory or request publishing.",
})
add("clinical", {
    "title":"Pre-check review queue", "subtitle":"Hospital-role reviewers decide QR eligibility. Final on-site clearance remains separate.",
    "precheckOutcome":"Pre-check outcome", "noFlags":"No automated review flag", "approveQr":"Approve QR eligibility",
    "decisionHelp":"Record a reasoned decision. This does not clear donation or compatibility.", "finalClearanceNotice":"The donor still requires final on-site assessment and collection-time testing.",
    "empty":"No screening in this queue", "emptyHelp":"New donor pre-check submissions appear here.",
})
add("component", {
    "prbc":"Packed red blood cells", "sdp":"Single-donor platelets", "rdp":"Random-donor platelets", "ffp":"Fresh frozen plasma",
    "cryoprecipitate":"Cryoprecipitate", "whole_blood":"Whole blood",
})
add("urgency", {
    "high":"High", "medium":"Medium", "low":"Low", "rare_standby":"Rare-group standby", "critical_pph":"Critical postpartum haemorrhage",
})
add("inventoryEvent", {"receipt":"Receipt", "issue":"Issue", "discard":"Discard", "adjustment":"Adjustment"})
add("resource", {
    "user":"User", "invitation":"Invitation", "donor_profile":"Donor profile", "screening":"Screening", "drive":"Drive",
    "drive_proposal":"Drive proposal", "drive_registration":"Drive registration", "hospital_profile":"Hospital profile",
    "blood_inventory":"Blood inventory", "inventory_event":"Inventory event", "checkin":"Check-in", "donation_record":"Donation record",
    "blood_request":"Blood request", "requisition_document":"Requisition document", "hospital_application_document":"Hospital evidence document",
    "campaign":"Campaign", "donor_alert":"Donor alert",
    "dispatch":"Dispatch", "platelet_window":"Platelet window", "push_subscription":"Push subscription",
})
add("auditAction", {
    "account_bootstrapped":"Account created or connected", "donor_profile_updated":"Donor profile updated",
    "screening_self_attested":"Pre-check submitted", "screening_qr_approved":"QR eligibility approved", "screening_qr_declined":"QR eligibility declined",
    "access_invitation_created":"Staff invitation created", "access_invitation_resent":"Staff invitation resent", "user_roles_replaced":"User roles updated", "user_status_changed":"User status changed",
    "drive_created":"Drive created", "drive_edited":"Drive edited", "drive_status_changed":"Drive status changed",
    "drive_proposal_created":"Drive proposal created", "drive_proposal_approved":"Drive proposal approved",
    "drive_proposal_changes_requested":"Drive proposal changes requested", "drive_proposal_rejected":"Drive proposal rejected",
    "drive_registration_created":"Drive registration created", "drive_registration_confirmed":"Drive registration confirmed",
    "drive_registration_cancelled":"Drive registration cancelled", "donor_qr_checked_in":"Donor checked in by QR",
    "donor_manual_checked_in":"Donor checked in manually", "donor_cleared":"Donor cleared on site", "donor_deferred":"Donor deferred on site",
    "donation_recorded":"Donation recorded", "hospital_application_created":"Hospital application created",
    "hospital_document_uploaded":"Hospital evidence uploaded",
    "hospital_verified":"Hospital verified", "hospital_rejected":"Hospital rejected", "inventory_receipt":"Inventory receipt",
    "inventory_issue":"Inventory issue", "inventory_discard":"Inventory discard", "inventory_adjustment":"Inventory adjustment",
    "requisition_document_uploaded":"Requisition uploaded", "request_created":"Blood request created", "request_verified":"Blood request verified",
    "request_rejected":"Blood request rejected", "request_resolved":"Blood request resolved", "campaign_created":"Campaign created",
    "campaign_updated":"Campaign updated", "campaign_email_requested":"Campaign email requested", "push_subscription_saved":"Push subscription saved",
    "rare_tier_dispatched":"Rare-group tier dispatched", "pph_bridge_activated":"Postpartum haemorrhage bridge activated",
    "platelet_schedule_created":"Platelet schedule created", "checkins_batch_recorded":"Check-in batch recorded",
    "donor_alert_accepted":"Donor alert accepted", "donor_alert_declined":"Donor alert declined",
})
add("inventory", {
    "title":"Audited blood inventory", "subtitle":"Real receipts, issues, discards and adjustments for the verified facility.",
    "record":"Record inventory movement", "recordHelp":"Each mutation creates an immutable operational event.", "empty":"No inventory recorded",
    "emptyHelp":"Record the first receipt to create an inventory line.", "movement":"Movement type", "units":"Number of units",
    "reference":"Receipt, issue or adjustment reference", "minimum":"Minimum level", "reason":"Reason or note",
})
add("requests", {
    "title":"Verified blood requests", "subtitle":"Create a protected requisition, verify required checks and publish a time-bound need.",
    "create":"Create blood request", "createHelp":"A signed PDF/JPG/PNG is encrypted. No donor alert appears before clinical verification.",
    "empty":"No request created", "emptyHelp":"Create a demand only from a verified facility.", "patientReference":"Internal patient reference, not patient name",
    "urgency":"Urgency", "validHours":"Validity in hours", "document":"Doctor-signed requisition", "verify":"Complete clinical verification",
})
add("venue", {
    "proposalsTitle":"Hosted drive proposals", "proposalsSubtitle":"Approve a proposal to create a real Approved drive for its organizer.",
    "noProposals":"No proposal addressed to this account", "noProposalsHelp":"Organizers must use the exact verified host email.",
    "hostEmail":"Host Venue account email", "recoverySeats":"Recovery seats", "power":"Protected power", "wifi":"Staff Wi-Fi",
    "parking":"Loading and parking", "privacy":"Clinical privacy partitions", "requestChanges":"Request changes",
    "impactTitle":"Hosted-drive impact", "impactSubtitle":"Only aggregate operational figures are displayed.", "approvedDrives":"Approved drives",
    "impactPrivacy":"No donor health answer or patient identity is included in host impact metrics.",
})
add("admin", {
    "overviewTitle":"Super Admin control center", "overviewSubtitle":"Real platform counts, approvals, invitations and audit oversight.",
    "users":"Users", "pendingHospitals":"Pending facilities", "openDrives":"Open drives", "donations":"Donations",
    "pendingInvites":"Pending invitations", "campaigns":"Campaigns", "requests":"Blood requests", "usersTitle":"People and permissions",
    "usersSubtitle":"Roles are stored in PostgreSQL and synchronized to Firebase custom claims.", "editRoles":"Edit roles", "disable":"Disable", "enable":"Enable",
    "invitationsTitle":"Staff invitations", "invitationsSubtitle":"The configured email service sends a real link; exact verified email matching applies roles.",
    "invite":"Invite staff", "resend":"Resend", "delivery":"Delivery", "inviteHelp":"Choose only the workspaces this email genuinely needs.", "chooseRole":"Select at least one role.",
    "noInvites":"No invitation sent", "noInvitesHelp":"Create the first staff invitation.", "hospitalsTitle":"Hospital applications",
    "hospitalsSubtitle":"Verify documents and facility authority before enabling operations.", "noHospitals":"No facility application", "noHospitalsHelp":"Submitted applications appear here.",
    "drivesTitle":"Drive approvals", "drivesSubtitle":"Planned organizer drives require approval before donor visibility.",
    "dataTitle":"Platform operational data", "dataSubtitle":"Super Admin overview without decrypted health answers or patient identity.",
    "donors":"Donors", "drives":"Drives", "registrations":"Registrations", "recentDonors":"Recent donor profiles",
    "safeDataNote":"Sensitive questionnaire answers remain restricted and encrypted.", "auditTitle":"Audit trail", "auditSubtitle":"Append-only security and operational events.",
    "event":"Event", "resource":"Resource", "noOperationalData":"No operational records", "noOperationalDataHelp":"Persisted records will appear here.", "noAudit":"No audit event", "noAuditHelp":"Operational events will appear here.",
})
add("error", {
    "title":"Action not completed", "backendConnection":"Firebase succeeded, but the browser could not reach the operational API. Check Render and CORS.",
    "backendWaking":"The backend is waking up. Wait a moment and retry.", "profileRequired":"Complete your donor profile first.",
    "approvalRequired":"An authorized approval is required before this action.", "permission":"Your account does not have permission for this action.",
    "email":"Check the email address and verification status.", "generic":"The action could not be completed. Refresh and try again.",
    "clipboard":"The browser blocked clipboard access.", "location":"Location permission was not granted.", "offline":"You are offline. Live operations are unavailable.",
})
add("success", {
    "title":"Saved", "profileSaved":"Donor profile saved securely.", "screeningSubmitted":"Pre-check submitted for authorized review.",
    "driveCreated":"Drive created as Planned and sent for approval.", "proposalSent":"Hosted-drive proposal sent.", "campaignSaved":"Campaign saved.",
    "campaignPublished":"Campaign published.", "applicationSent":"Facility application stored and administrator notification requested.",
    "inventorySaved":"Inventory movement recorded.", "requestCreated":"Pending blood request created.", "requestVerified":"Blood request verified and published.",
    "registered":"Drive registration confirmed.", "checkedIn":"Donor checked in.", "assessmentSaved":"Clinical assessment recorded.",
    "donationSaved":"Collected unit recorded.", "reviewSaved":"Screening review decision recorded.", "inviteSent":"Invitation email sent.",
    "inviteRecorded":"Invitation recorded; configure the email provider to deliver email.", "rolesSaved":"Roles updated; the user must refresh their token.",
    "decisionSaved":"Decision recorded.", "evidenceUploaded":"Facility evidence uploaded securely.", "driveUpdated":"Drive status updated.", "linkCopied":"Registration link copied.",
    "emailSent":"Campaign email sent.", "emailRecorded":"Email request recorded; configure the email provider for delivery.", "online":"Connection restored.",
    "updateReady":"A new RaktFlow version is ready and will be used after refresh.",
})

status_phrases = {
    "active":"Active", "approved":"Approved", "cancelled":"Cancelled", "checked_in":"Checked in", "changes_requested":"Changes requested",
    "cleared":"Cleared", "completed":"Completed", "declined":"Declined", "deferred":"Deferred", "disabled":"Disabled", "draft":"Draft",
    "failed":"Failed", "high":"High", "low":"Low", "medium":"Medium", "not_checked_in":"Not checked in", "accepted":"Accepted",
    "expired":"Expired", "not_sent":"Not sent", "pending":"Pending", "pending_review":"Pending review", "planned":"Planned", "published":"Published",
    "registered":"Registered", "rejected":"Rejected", "resolved":"Resolved", "sent":"Sent", "unknown":"Unknown", "verified":"Verified", "walk_in":"Walk-in", "proceed_to_clinical":"Proceed to clinical review",
    "clinical_review":"Clinical review", "temporary_deferral_suggested":"Temporary deferral suggested",
    "age_requires_review":"Age requires review", "weight_below_configured_threshold":"Weight below configured threshold",
    "current_health_requires_review":"Current health requires review", "medication_requires_review":"Medication requires review",
    "medical_history_requires_review":"Medical history requires review", "recent_procedure_requires_review":"Recent procedure requires review",
    "recent_tattoo_piercing_requires_review":"Recent tattoo or piercing requires review", "travel_requires_review":"Travel requires review",
    "pregnancy_related_review":"Pregnancy-related review", "recent_donation_requires_review":"Recent donation requires review",
    "role_donor":"Donor", "role_organizer":"Organizer", "role_hospital":"Hospital", "role_host_venue":"Host venue",
    "role_super_admin":"Super Admin", "email_provider_not_configured":"Email provider not configured",
}
add("status", status_phrases)

missing = sorted(keys - EN.keys())
if missing:
    raise SystemExit(f"English catalog missing: {missing}")

out = ROOT / "frontend/src/locales"
out.mkdir(parents=True, exist_ok=True)
(out / "en.json").write_text(json.dumps(dict(sorted(EN.items())), ensure_ascii=False, indent=2) + "\n")


def translate_batch(values: list[str], target: str) -> list[str]:
    text = "\n".join(values)
    query = urllib.parse.urlencode({"client":"gtx", "sl":"en", "tl":target, "dt":"t", "q":text})
    request = urllib.request.Request(
        "https://translate.googleapis.com/translate_a/single?" + query,
        headers={"User-Agent":"Mozilla/5.0"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.loads(response.read().decode())
    translated = "".join(part[0] for part in payload[0] if part[0])
    lines = translated.split("\n")
    if len(lines) != len(values):
        raise RuntimeError(f"Translation line mismatch for {target}: {len(lines)} != {len(values)}")
    return lines


for locale in ["hi", "te", "bn", "mr", "ta", "kn", "ml"]:
    items = sorted(EN.items())
    translated: dict[str, str] = {}
    chunk: list[tuple[str, str]] = []
    size = 0
    for key, value in items + [("", "")]:
        if chunk and (size + len(value) > 3500 or not key):
            values = [item[1] for item in chunk]
            for attempt in range(3):
                try:
                    results = translate_batch(values, locale)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(2 + attempt)
            translated.update({item[0]: result for item, result in zip(chunk, results, strict=True)})
            chunk = []
            size = 0
            time.sleep(0.4)
        if key:
            chunk.append((key, value))
            size += len(value) + 1
    (out / f"{locale}.json").write_text(json.dumps(dict(sorted(translated.items())), ensure_ascii=False, indent=2) + "\n")
    print(locale, len(translated))
