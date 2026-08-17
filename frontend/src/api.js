import { getRaktFlowAuth } from './auth.js';

const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
// Recover safely from the common deployment mistake where the health endpoint
// was pasted instead of the Render service origin.
const API_BASE = RAW_API_BASE.replace(/\/api\/v1\/health$/i, '');

export const isApiConfigured = () => Boolean(API_BASE);
export const configuredApiOrigin = () => API_BASE;

async function parseResponse(response) {
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `RaktFlow API returned ${response.status}`);
  return payload;
}

async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const hint = error?.name === 'AbortError'
      ? 'The request timed out while the backend was waking up.'
      : 'The browser could not reach the RaktFlow API. Check Render status and CORS settings.';
    throw new Error(hint, { cause: error });
  }
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
  return fetch(`${API_BASE}/api/v1/ping`, { method: 'HEAD', signal: controller.signal })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}
