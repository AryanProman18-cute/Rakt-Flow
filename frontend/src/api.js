import { getRaktFlowAuth } from './auth.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const isApiConfigured = () => Boolean(API_BASE);

async function parseResponse(response) {
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `RaktFlow API returned ${response.status}`);
  return payload;
}

export async function apiFetch(path, options = {}) {
  const user = getRaktFlowAuth().currentUser;
  if (!user) throw new Error('Authentication required');
  const token = await user.getIdToken();
  const headers = { Authorization: `Bearer ${token}`, ...options.headers };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE}/api/v1${path}`, { ...options, headers });
  return parseResponse(response);
}

export async function publicApiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}/api/v1${path}`, options);
  return parseResponse(response);
}

export function prewarmApi() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 2500);
  return fetch(`${API_BASE}/api/v1/ping`, { method: 'HEAD', signal: controller.signal }).catch(() => null);
}
