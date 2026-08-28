import { getRaktFlowAuth } from './auth.js';

const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
// Recover safely from the common deployment mistake where the health endpoint
// was pasted instead of the Render service origin.
const API_BASE = RAW_API_BASE.replace(/\/api\/v1\/health$/i, '');

export const isApiConfigured = () => Boolean(API_BASE);
export const configuredApiOrigin = () => API_BASE;

function detailMessage(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(item => {
      const field = Array.isArray(item?.loc) ? item.loc.filter(part => part !== 'body').join(' → ') : '';
      return `${field ? `${field}: ` : ''}${item?.msg || 'Invalid value'}`;
    }).join(' · ');
  }
  return '';
}

export class ApiError extends Error {
  constructor(message, status, payload = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = detailMessage(payload.detail) || `RaktFlow API returned ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }
  return payload;
}

async function request(url, options) {
  const method = String(options?.method || 'GET').toUpperCase();
  const timeoutMs = options?.timeoutMs || 45000;
  // A hanging request during a cold start must fail cleanly so the caller can
  // wait for the API and retry, instead of spinning forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const requestOptions = { ...options, signal: options?.signal || controller.signal };
  try {
    return await fetch(url, requestOptions);
  } catch (error) {
    // A sleeping free Render service fails the FIRST connection. Reads are
    // safe to retry once without side effects; writes are left to the caller
    // so the action is never silently double-submitted.
    const safeToRetry = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (safeToRetry && error?.name !== 'AbortError') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      try { return await fetch(url, requestOptions); } catch { /* fall through to the hint below */ }
    }
    const hint = error?.name === 'AbortError'
      ? 'The request timed out while the backend was waking up.'
      : 'The browser could not reach the RaktFlow API. Check Render status and CORS settings.';
    throw new Error(hint, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap liveness probe used before telling the user to retry a failed action. */
export async function pingApi(timeoutMs = 8000) {
  if (!API_BASE) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/api/v1/health`, { method: 'GET', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wait until the backend answers a health probe. A free Render service can
 * take 30–90 s to wake; callers use this before a write so the user does not
 * have to tap again once the instance is up.
 */
export async function waitForApi({ maxMs = 90000, intervalMs = 3000, onWait } = {}) {
  const deadline = Date.now() + maxMs;
  let waited = 0;
  while (Date.now() < deadline) {
    if (await pingApi(6000)) return true;
    waited += intervalMs;
    onWait?.(waited);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return await pingApi(6000);
}

export async function apiFetch(path, options = {}) {
  if (!API_BASE) throw new Error('The frontend API address is not configured.');
  const user = getRaktFlowAuth().currentUser;
  if (!user) throw new Error('Authentication required');
  const token = await user.getIdToken();
  const headers = { Authorization: `Bearer ${token}`, ...options.headers };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await request(`${API_BASE}/api/v1${path}`, { ...options, headers });
  return parseResponse(response);
}

export async function apiDownload(path) {
  if (!API_BASE) throw new Error('The frontend API address is not configured.');
  const user = getRaktFlowAuth().currentUser;
  if (!user) throw new Error('Authentication required');
  const token = await user.getIdToken();
  const response = await request(`${API_BASE}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || `RaktFlow API returned ${response.status}`);
  }
  return {
    blob: await response.blob(),
    disposition: response.headers.get('Content-Disposition') || ''
  };
}

export async function publicApiFetch(path, options = {}) {
  if (!API_BASE) throw new Error('The frontend API address is not configured.');
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await request(`${API_BASE}/api/v1${path}`, { ...options, headers });
  return parseResponse(response);
}

export function prewarmApi() {
  if (!API_BASE) return Promise.resolve(null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  return fetch(`${API_BASE}/api/v1/health`, { method: 'GET', signal: controller.signal })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}
