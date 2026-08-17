# RaktFlow V3.2.1 cross-browser Google sign-in fix

This patch fixes Google authentication that could remain on **Preparing your workspace**, show Firebase's **missing initial state** page, or be blocked as a popup in Safari, Firefox, Opera, and privacy-partitioning browsers.

## What changed

- Google sign-in now uses a full-page Firebase redirect instead of requiring a popup.
- Vercel transparently reverse-proxies `/__/auth/*` to `raktflow-1.firebaseapp.com`, so Firebase's temporary authentication state remains first-party on the RaktFlow origin.
- The app consumes the Firebase redirect result before bootstrapping the authenticated workspace.
- Email/password registration, server-controlled roles, Neon data, and all V3.2 workflows remain unchanged.

## One-time production configuration

### 1. Firebase authorized domain

In **Firebase Console → Authentication → Settings → Authorized domains**, confirm this entry exists:

```text
raktflow-demo123.vercel.app
```

### 2. Google OAuth redirect URI

In the Google Cloud project used by Firebase, open **Google Auth Platform / APIs & Services → Credentials → OAuth 2.0 Client IDs**. Open the web client used by Firebase Authentication and add this exact authorized redirect URI:

```text
https://raktflow-demo123.vercel.app/__/auth/handler
```

Keep the existing Firebase redirect URI as well. Do not expose or change the OAuth client secret.

### 3. Vercel production environment

In **Vercel → RaktFlow project → Settings → Environments**, edit the existing variable for Production:

```text
VITE_FIREBASE_AUTH_DOMAIN=raktflow-demo123.vercel.app
```

Use only the hostname: no `https://`, slash, or path. Keep the other Firebase variables and `VITE_API_BASE_URL` unchanged.

## Apply this patch

1. Upload `RaktFlow_v3_2_1_Auth_Fix.zip` to the root of `AryanProman18-cute/Rakt-Flow`.
2. Run the existing GitHub Actions workflow **Unpack RaktFlow V3** on `main`.
3. Because GitHub is now connected to Vercel, wait for a new current-time Production deployment from the patch commit.
4. Do not redeploy an older Vercel deployment.

## Test

1. Close old RaktFlow and Firebase handler tabs.
2. Clear site data for `raktflow-demo123.vercel.app` once so the old service worker and incomplete Firebase session cannot interfere.
3. Open `https://raktflow-demo123.vercel.app` in a normal Safari, Chrome, Firefox, Brave, or Opera window.
4. Select **Continue with Google**. A full-page Google flow should return to RaktFlow without requiring a popup.
5. Sign in with `chemnaam@gmail.com` and confirm the workspace selector exposes the five server-assigned roles.

No Neon migration or Render change is required for this patch.
