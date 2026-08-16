import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
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
  if (!auth) auth = getAuth(initializeApp(firebaseConfig));
  return auth;
}

export async function sendMagicLink(email) {
  const continueUrl = `${location.origin}${location.pathname}`;
  await sendSignInLinkToEmail(getRaktFlowAuth(), email, { url: continueUrl, handleCodeInApp: true });
  localStorage.setItem('raktflow-email-for-signin', email.trim().toLowerCase());
}

export async function completeMagicLink(email = '') {
  if (!isAuthConfigured() || !isSignInWithEmailLink(getRaktFlowAuth(), location.href)) return null;
  const resolvedEmail = email || localStorage.getItem('raktflow-email-for-signin');
  if (!resolvedEmail) throw new Error('Enter the same email address to complete secure sign-in.');
  const result = await signInWithEmailLink(getRaktFlowAuth(), resolvedEmail, location.href);
  localStorage.removeItem('raktflow-email-for-signin');
  history.replaceState({}, '', location.pathname);
  return result.user;
}

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(getRaktFlowAuth(), provider);
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
