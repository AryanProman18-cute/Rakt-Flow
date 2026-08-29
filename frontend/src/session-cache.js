/**
 * Cached signed-in session so a page refresh never throws the user back to the
 * login screen. The app shell renders instantly from this cache while the live
 * session re-validates against Firebase + the API in the background.
 *
 * Contains only non-sensitive presentation data (roles, profile summary,
 * preferred workspace). Never stores ID tokens or credentials.
 */
const KEY = 'raktflow.session.v3';

export function saveSession(patch) {
  try {
    const existing = loadSession() || {};
    const next = {
      ...existing,
      ...patch,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    /* restricted storage (private tabs) — session simply won't be cached */
    return null;
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    return value;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
