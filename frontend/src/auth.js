import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export function isAuthConfigured() {
  return Object.values(firebaseConfig).every(Boolean);
}

let auth;
export function getRaktFlowAuth() {
  if (!isAuthConfigured()) throw new Error('Firebase authentication is not configured for this deployment.');
  if (!auth) {
    auth = getAuth(initializeApp(firebaseConfig));
    auth.useDeviceLanguage();
  }
  return auth;
}

function normalizedEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function actionCodeSettings() {
  return {
    url: `${location.origin}${location.pathname}`,
    handleCodeInApp: false
  };
}

function authenticationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Register a self-service donor identity. Authorization is still assigned by
 * the FastAPI bootstrap endpoint; the browser cannot select a staff role.
 */
export async function registerDonorWithPassword(email, password) {
  const firebaseAuth = getRaktFlowAuth();
  const result = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail(email), password);
  try {
    await sendEmailVerification(result.user, actionCodeSettings());
  } finally {
    // Unverified identities must not remain in an authenticated app session.
    await signOut(firebaseAuth);
  }
  return result.user;
}

export async function signInWithPassword(email, password) {
  const firebaseAuth = getRaktFlowAuth();
  const result = await signInWithEmailAndPassword(firebaseAuth, normalizedEmail(email), password);
  if (!result.user.emailVerified) {
    let resent = false;
    try {
      await sendEmailVerification(result.user, actionCodeSettings());
      resent = true;
    } catch {
      // A previous verification message may still be valid, or Firebase may
      // temporarily throttle repeated sends. The account remains blocked.
    } finally {
      await signOut(firebaseAuth);
    }
    throw authenticationError(
      'auth/email-not-verified',
      resent
        ? 'Verify your email before signing in. A new verification message was sent.'
        : 'Verify your email before signing in. Use the verification message already in your inbox.'
    );
  }
  return result;
}

export async function sendPasswordReset(email) {
  try {
    await sendPasswordResetEmail(getRaktFlowAuth(), normalizedEmail(email), actionCodeSettings());
  } catch (error) {
    // Preserve one indistinguishable recovery response for unknown addresses.
    if (error?.code === 'auth/user-not-found') return;
    throw error;
  }
}

/**
 * Transitional support for links issued by the earlier passwordless release.
 * The V3.1 interface no longer sends new sign-in links.
 */
export async function completeLegacyMagicLink(email = '') {
  const firebaseAuth = getRaktFlowAuth();
  if (!isSignInWithEmailLink(firebaseAuth, location.href)) return null;
  const resolvedEmail = normalizedEmail(email || localStorage.getItem('raktflow-email-for-signin'));
  if (!resolvedEmail) throw new Error('Enter the same email address to complete this older sign-in link.');
  const result = await signInWithEmailLink(firebaseAuth, resolvedEmail, location.href);
  localStorage.removeItem('raktflow-email-for-signin');
  history.replaceState({}, '', location.pathname);
  return result.user;
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/**
 * Popup-first Google sign-in.
 *
 * `signInWithRedirect` fails in storage-partitioned browsers (in-app webviews
 * such as WhatsApp/Instagram, Brave, some Safari/Firefox privacy modes) with
 * "Unable to process request due to missing initial state" because the auth
 * handler cannot read the pending state across the partition boundary.
 *
 * Popup mode communicates back over postMessage and works in those contexts,
 * so we try it first and only fall back to redirect when popups are blocked
 * or not available. The Vercel /__/auth/* proxy stays in place, which keeps
 * the redirect path first-party for the browsers that do use it.
 */
export async function signInWithGoogle() {
  const firebaseAuth = getRaktFlowAuth();
  const provider = googleProvider();
  try {
    await signInWithPopup(firebaseAuth, provider);
    return { method: 'popup' };
  } catch (error) {
    const code = error?.code;
    const popupUnavailable = [
      'auth/popup-blocked',
      'auth/operation-not-allowed',
      'auth/unauthorized-domain',
      'auth/cancelled-popup-request',
      'auth/web-storage-unsupported'
    ].includes(code);
    if (!popupUnavailable) throw error;
    await signInWithRedirect(firebaseAuth, provider);
    return { method: 'redirect' };
  }
}

export async function completeGoogleRedirect() {
  const result = await getRedirectResult(getRaktFlowAuth());
  return result?.user || null;
}

export function observeAuth(callback) {
  if (!isAuthConfigured()) {
    queueMicrotask(() => callback(null));
    return () => {};
  }
  return onAuthStateChanged(getRaktFlowAuth(), callback);
}

export function signOutUser() {
  return signOut(getRaktFlowAuth());
}

export function authErrorMessage(error) {
  // Storage-partitioned browsers abort the redirect hand-off with "missing
  // initial state"; surface a practical next step instead of the raw message.
  if (/initial state/i.test(String(error?.message || ''))) {
    return 'This browser blocked the secure Google sign-in hand-off (common in private or in-app browsers). Open raktflow in Chrome/Safari, or use email & password above.';
  }
  const messages = {
    'auth/account-exists-with-different-credential': 'An account already exists for this email. Use its original sign-in method or reset the password.',
    'auth/email-already-in-use': 'An account already exists for this email. Sign in or use Forgot password.',
    'auth/email-not-verified': error?.message,
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/missing-password': 'Enter your password.',
    'auth/network-request-failed': 'The authentication network request failed. Check your connection, VPN, content blocker, or private DNS.',
    'auth/operation-not-allowed': 'Email and password sign-in is not enabled in Firebase yet.',
    'auth/popup-blocked': 'The browser blocked the Google sign-in window. Allow pop-ups and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled before it finished.',
    'auth/redirect-cancelled-by-user': 'Google sign-in was cancelled or blocked by this browser. Try again, open the site in Chrome/Safari, or use email & password.',
    'auth/unauthorized-domain': 'This website address is not authorised for Google sign-in in Firebase yet. Contact the administrator.',
    'auth/web-storage-unsupported': 'This browser blocks the secure storage Google sign-in needs. Try Chrome/Safari, or use email & password.',
    'auth/too-many-requests': 'Too many attempts were made. Wait a little before trying again.',
    'auth/user-disabled': 'This Firebase account has been disabled.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
    'auth/wrong-password': 'The email or password is incorrect.'
  };
  return messages[error?.code] || error?.message || 'Authentication could not be completed.';
}
