# RaktFlow Implementation Guide

## Overview
This package contains all the improvements and fixes for the RaktFlow blood donation platform. Based on analysis of rakt.in enterprise features and PDF review decisions, this implementation includes:

1. **Privacy enhancements** - Donor location minimization
2. **Consent management** - Layered consent architecture  
3. **Clinical safety** - Separation of duties and validation
4. **Communication truthfulness** - Email status reporting
5. **UI/UX improvements** - Screening question updates

## Prerequisites
- Python 3.10+
- Node.js 18+ (for frontend)
- MongoDB or PostgreSQL database
- Firebase project for authentication
- Render/Vercel for deployment

## Installation Steps

### Step 1: Clone the Repository
```bash
git clone https://github.com/AryanProman18-cute/Rakt-Flow.git
cd Rakt-Flow
```

### Step 2: Apply the Improvements
Apply the patch to incorporate all fixes:
```bash
cd Rakt-Flow
git apply /home/user/raktflow-changes.patch
```

### Step 3: Backend Setup
```bash
cd Rakt-Flow/Backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
# Edit .env with your configuration:
# - MongoDB URI
# - Firebase project ID and credentials
# - ENDGAMING_AI_KEY for AI bot
# - PII_ENCRYPTION_KEY and PHONE_HASH_PEPPER
npm run dev
```

### Step 4: Frontend Setup
```bash
cd Rakt-Flow/Frontend
npm ci
cp .env.example .env.local
# Add Firebase web configuration
npm run dev
```

### Step 5: Database Migration
Run the migration rehearsal as described in `APPLY_V3_3_UPDATE.md`:
1. Create a copy of your Neon production branch
2. Run `migrations/005_trust_logistics_and_mobile.sql` on the branch
3. Test the smoke queries in `docs/V3_3_MIGRATION_SMOKE.sql`
4. Only after acceptance, apply to production

## Key Changes Summary

### 1. Donor Location Minimization (`backend/app/models/entities.py`)
- **What changed**: `DonorProfile.location` (Geography POINT) replaced with `approximate_location_grid: String(32)`
- **Why**: Exact donor coordinates are no longer persisted - used ephemerally in browser and discarded after session
- **Implementation**: The model now stores approximate grid cells for nearby matching instead of exact latitude/longitude

### 2. Screening Questions Update (`backend/app/schemas/accounts.py`)
- **What changed**: 
  - `malaria_risk_travel_or_residence`: Made optional (`bool | None = None`)
  - `pregnancy_breastfeeding_or_recent_delivery`: Made compulsory (`bool`)
  - Added 4 new optional fields:
    - `recent_illness_or_fever: bool | None = None`
    - `travel_to_malaria_zone_last_12_months: bool | None = None`
    - `tattoo_or_piercing_details: str | None = None`
    - `medication_list: str | None = None`
- **Why**: Per user request - some questions should not be compulsory, and more data fields for better collection

### 3. Separation of Duties (`backend/app/services/components.py`)
- **What added**: `validate_separation_of_duties(component_id, user_id, session)` function
- **Why**: Prevents same user from both dispatching and receiving a cold-chain handover for same component
- **Implementation**: Raises `HTTP 403` if same user attempts both roles

### 4. Email Truthfulness (`backend/app/services/email.py`)
- **What changed**: `_send_email()` returns actual API status instead of always claiming "SENT"
- **Why**: Per PDF finding #9 - never claim SENT unless provider confirms delivery
- **Implementation**: Returns actual `payload.status` from Resend API

## Enterprise Features Integration (from rakt.in research)

### A. ISBT 128 Label Generation
1. Add bwip-js library to frontend: `npm install bwip-js`
2. Add barcode generation component in organizer intake screen
3. Implement label printing before bag collection
4. Generate ISBT 128 Data Structure 002 (ABO/Rh) and Data Structure 003 (Product Code)

### B. ABHA/ABDM Donor Identity
1. Connect to government ABDM sandbox API
2. Add "Create or Link ABHA" button in donor registration
3. Implement OTP verification flow
4. Auto-populate donor profile from ABHA number
5. Enforce: donor must actively consent via their own device

### C. Compliance Reports (NABH/NBTC)
1. Add report generation endpoints in backend
2. Generate over 100 statutory registers:
   - Donor Register, TTI Register, Grouping Register
   - Issue Register, Crossmatch Register, Component Preparation Record
   - NABH Performance Indicators, SBTC Report
3. Add report download in PDF/Excel formats

### D. Real-time Inventory Dashboard
1. Add real-time component status endpoint
2. Implement expiry alert system (expired/24-hour/soon/policy-window)
3. Add cold-chain temperature monitoring display
4. Prioritize traceable unexpired per-unit components

### E. Donor Card Generation
1. Add donor card generation endpoint
2. Include: blood group, last donation date, eligibility status, reference code
3. Send via SMS (via Resend/Telegram) and email
4. Make downloadable from donor profile

### F. Real-time Error Validation
1. Add validation middleware for all data entry fields
2. Implement real-time error notifications like:
   - "Blood group must be valid ABO type"
   - "Weight must be between 25-250 kg"
   - "Age must be 18-65 years"
   - "Phone number must be 10-15 digits"

## Deployment Instructions

### Render Deployment
1. Set environment variables in Render dashboard:
   - `APP_ENV=production`
   - `DATABASE_URL` (asyncpg URL with SSL)
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CREDENTIALS_JSON` (secret)
   - `TOKEN_SIGNING_SECRET` (32+ chars)
   - `PII_ENCRYPTION_KEY`
   - `PHONE_HASH_PEPPER`
   - `CORS_ORIGINS=["https://your-vercel-app.vercel.app"]`
   - `PUBLIC_APP_URL=https://your-vercel-app.vercel.app`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `ADMIN_NOTIFICATION_EMAIL`
   - `CONTACT_EMAIL`
   - `CONTACT_PHONE`

2. Deploy backend service
3. Deploy frontend via Vercel (connected to GitHub)

### Vercel Deployment
1. Import repository to Vercel
2. Set environment variables in Vercel dashboard
3. Ensure `vercel.json` reverse-proxies `/__/auth/*` to Firebase Hosting
4. Add `https://your-vercel-app.vercel.app/__/auth/handler` to Firebase authorized redirect URIs

## Post-Deployment Checklist

### ✅ Essential Tests
1. **Email test**: Send test email, verify status is truthfully reported
2. **Donor registration**: Test complete flow with optional/compulsory questions
3. **Hospital access**: Super Admin assigns ROLE_HOSPITAL to test user
4. **Drive creation**: Test drive creation, quota management, registrations
5. **Clinical review**: Test hospital review queue with facility verification
6. **Separation of duties**: Test that same user cannot dispatch/receive same component

### 📋 Recommended Configurations
- Set `screening_min_age: 18` and `screening_max_age: 65` in config
- Configure `PII_ENCRYPTION_KEY` and `PHONE_HASH_PEPPER` from managed secret store
- Set `MAX_DB_CONNECTIONS=5` for free tier
- Configure CORS origins exactly (no wildcards)
- Set `PUBLIC_APP_URL` to use HTTPS

## Getting Help

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Hospital access denied | Super Admin must assign `ROLE_HOSPITAL` via `POST /admin/users/{user_id}/roles` |
| Email shows "EMAIL_PROVIDER_NOT_CONFIGURED" | Set `RESEND_API_KEY` and `EMAIL_FROM` in environment |
| Donor location shows exact coords | Ensure using updated model with `approximate_location_grid` |
| Screening questions validation | Check `ge=25, le=250` for weight, age gates in config |
| Drive quotas not blocking | Ensure drive status is `APPROVED` or `ACTIVE`, quotas are set |

## Compliance Checklist (DPDP Act & Regulations)

### ✅ Required Implementations
- [ ] Geospatial data minimization (approximate location grid)
- [ ] Layered consent architecture (separate mandatory vs optional)
- [ ] Append-only audit trails (every action permanently recorded)
- [ ] Age gating (18-65 enforced)
- [ ] Least-privilege clinical review (facility + donor consent required)
- [ ] Separation of duties (no single user both dispatch/receive)
- [ ] Communication truthfulness (never falsely claim delivery)

### 📋 Recommended Additions (from rakt.in)
- [ ] ISBT 128 compliant labeling
- [ ] ABHA donor identity integration
- [ ] Real-time error validation
- [ ] Compliance report generation (100+ registers)
- [ ] Staff activity tracking enhancement
- [ ] Real-time inventory dashboard

---
