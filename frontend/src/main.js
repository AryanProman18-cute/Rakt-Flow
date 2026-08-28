import './styles.css';
import './v32-components.css';
import './map-adapter.css';
import './evidence.css';
import './settings.css';
import './logistics.css';
import QRCode from 'qrcode';
import { BLOOD_BANK_CENTRES } from './public/blood-banks.js';

import { apiDownload, apiFetch, configuredApiOrigin, isApiConfigured, pingApi, prewarmApi, publicApiFetch, waitForApi } from './api.js';
import {
  authErrorMessage,
  completeGoogleRedirect,
  completeLegacyMagicLink,
  isAuthConfigured,
  observeAuth,
  registerDonorWithPassword,
  sendPasswordReset,
  signInWithGoogle,
  signInWithPassword,
  signOutUser
} from './auth.js';
import { getLocale, languages, loadLocale, setLocale, tr } from './i18n.js';
import { hydrateMapplsMaps, miniMapMarkup } from './map-adapter.js';
import { registerServiceWorker } from './register-sw.js';

/** Visible build marker so a screenshot can always identify the deployed version. */
const BUILD_TAG = 'v3.3.1-h10';

const icons = {
  activity: '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
  alert: '<path d="M10.3 3.5 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.5a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1M10 21v-3h4v3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  camera: '<path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  droplet: '<path d="M12 2.7S5.5 10 5.5 15a6.5 6.5 0 0 0 13 0c0-5-6.5-12.3-6.5-12.3Z"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l7.8-7.5a5.5 5.5 0 0 0 1-8.9Z"/>',
  home: '<path d="M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 19.8Z"/><path d="M9 21v-7h6v7"/>',
  hospital: '<path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M2 21h20M17 9h3v12M8 8h5M10.5 5.5v5"/>',
  inventory: '<path d="M4 7h16v14H4zM2 3h20v4H2zM9 11h6"/>',
  language: '<path d="M4 5h7M7.5 3v2M5 9c2-1 4-3 5-6M4 13l4-4 3 3M14 20l4-11 4 11M15.5 16h5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  moon: '<path d="M21 12.8A8.8 8.8 0 1 1 11.2 3 6.8 6.8 0 0 0 21 12.8Z"/>',
  pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/>',
  refresh: '<path d="M20 7h-5V2M4 17h5v5M19 12a7 7 0 0 0-12-5l-2 2M5 12a7 7 0 0 0 12 5l2-2"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-2.8 2.8a1.7 1.7 0 0 0-1.9-.3A1.7 1.7 0 0 0 14 21h-4a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3L4.3 17a1.7 1.7 0 0 0 .3-2A1.7 1.7 0 0 0 3 14v-4a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L7.1 4.3a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3L19.7 7a1.7 1.7 0 0 0-.3 2A1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>'
};

function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.droplet}</svg>`;
}

const roleConfig = {
  donor: {
    claim: 'ROLE_DONOR', label: 'role.donor', icon: 'droplet', landing: 'home',
    nav: [['home','nav.home','home'],['drives','nav.drives','calendar'],['needs','nav.needs','alert'],['history','nav.history','file'],['pass','nav.pass','qr'],['settings','nav.settings','settings']]
  },
  organizer: {
    claim: 'ROLE_ORGANIZER', label: 'role.organizer', icon: 'users', landing: 'overview',
    nav: [['overview','nav.overview','home'],['drives','nav.manageDrives','calendar'],['campaigns','nav.campaigns','link'],['intake','nav.intake','scan'],['roster','nav.roster','users'],['reconcile','nav.reconciliation','check'],['settings','nav.settings','settings']]
  },
  hospital: {
    claim: 'ROLE_HOSPITAL', label: 'role.hospital', icon: 'hospital', landing: 'overview',
    nav: [['overview','nav.overview','home'],['clinical','nav.clinicalReview','shield'],['inventory','nav.inventory','inventory'],['components','nav.components','droplet'],['requests','nav.requests','file'],['settings','nav.settings','settings']]
  },
  venue: {
    claim: 'ROLE_HOST_VENUE', label: 'role.venue', icon: 'building', landing: 'proposals',
    nav: [['proposals','nav.proposals','calendar'],['impact','nav.impact','chart'],['settings','nav.settings','settings']]
  },
  admin: {
    claim: 'ROLE_SUPER_ADMIN', label: 'role.admin', icon: 'shield', landing: 'overview',
    nav: [['overview','nav.overview','home'],['users','nav.users','users'],['invitations','nav.invitations','mail'],['hospitals','nav.hospitals','hospital'],['drives','nav.driveApprovals','calendar'],['data','nav.platformData','inventory'],['privacy','nav.privacy','lock'],['audit','nav.audit','activity'],['settings','nav.settings','settings']]
  }
};

const storage = (() => {
  try {
    localStorage.setItem('__rf_test__', '1');
    localStorage.removeItem('__rf_test__');
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
})();

const query = new URLSearchParams(location.search);
const state = {
  screen: 'landing',
  locale: getLocale(),
  theme: storage.getItem('raktflow-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  role: storage.getItem('raktflow-role') || 'donor',
  view: 'home',
  mobileMenu: false,
  roleMenu: false,
  online: navigator.onLine,
  loadingKey: 'loading.connecting',
  authError: '',
  authUser: null,
  account: null,
  publicConfig: { contact_email: 'chemnaam@gmail.com', contact_phone: '9908840322' },
  publicStats: null,
  publicDrives: [],
  publicRequests: [],
  publicCentres: [],
  publicBanks: BLOOD_BANK_CENTRES,
  facilityCentres: [],
  verifiedNeeds: [],
  campaignLanding: null,
  campaignQuery: query.get('campaign'),
  invitationQuery: query.get('invite'),
  profile: null,
  registrations: [],
  donationHistory: [],
  donorAlerts: [],
  donorUnitNotifications: [],
  preferences: null,
  consentHistory: [],
  privacyRequests: [],
  adminPrivacyRequests: [],
  drives: [],
  activeDriveId: null,
  roster: [],
  reconciliation: null,
  proposals: [],
  hostImpact: [],
  campaigns: [],
  selectedCampaignId: null,
  campaignStats: {},
  intakeDonor: null,
  hospitalProfile: null,
  hospitalDocuments: [],
  inventory: [],
  inventoryEvents: [],
  hospitalRequests: [],
  rareDispatchHistory: {},
  clinicalQueue: [],
  components: [],
  componentExpiry: {},
  componentPolicies: [],
  handovers: [],
  driveQuotas: [],
  quotaRecommendations: [],
  adminOverview: null,
  adminUsers: [],
  invitations: [],
  hospitalApplications: [],
  adminData: null,
  audit: []
};

state.view = roleConfig[state.role]?.landing || 'home';
document.documentElement.dataset.theme = state.theme;
document.documentElement.lang = state.locale;

const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const toastRegion = document.querySelector('#toast-region');
let modalCleanup = null;
let modalReturnFocus = null;

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function fmtDate(value) {
  if (!value) return tr('common.none');
  return new Intl.DateTimeFormat(state.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusLabel(value) {
  return tr(`status.${String(value || 'unknown').toLowerCase()}`);
}

function roleLabel(claim) {
  const config = Object.values(roleConfig).find(item => item.claim === claim);
  return config ? tr(config.label) : String(claim || '').replace('ROLE_', '').replaceAll('_', ' ');
}

function domainLabel(prefix, value) {
  const key = `${prefix}.${String(value || 'unknown').toLowerCase()}`;
  const translated = tr(key);
  return translated === key ? String(value || '').replaceAll('_', ' ') : translated;
}

function statusBadge(value) {
  const normalized = String(value || 'UNKNOWN').toUpperCase();
  const good = ['ACTIVE','APPROVED','VERIFIED','COMPLETED','CLEARED','SENT','CHECKED_IN','PUBLISHED'].includes(normalized);
  const warn = ['PENDING','PLANNED','PENDING_REVIEW','REGISTERED','DRAFT','CHANGES_REQUESTED'].includes(normalized);
  return `<span class="badge ${good ? 'badge-green' : warn ? 'badge-amber' : 'badge-neutral'}">${esc(statusLabel(normalized))}</span>`;
}

function friendlyError(error) {
  console.error(error);
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('cors') || message.includes('could not reach')) return tr('error.backendConnection');
  if (message.includes('timed out') || message.includes('waking up')) return tr('error.backendWaking');
  if (message.includes('profile')) return tr('error.profileRequired');
  if (message.includes('approved') || message.includes('approval')) return tr('error.approvalRequired');
  if (message.includes('role') || message.includes('authorized')) return tr('error.permission');
  if (message.includes('email')) return tr('error.email');
  if (Number(error?.status) >= 400 && Number(error?.status) < 500 && error?.message) return error.message;
  return tr('error.generic');
}

/**
 * Run a backend write, waiting for a sleeping API first and retrying exactly
 * once if the connection is dropped while waking. Non-network errors bubble up
 * so callers keep their own specific handling.
 */
async function withBackendReady(fn) {
  // Wait silently through a short cold start before alarming the user; only
  // show the waking toast when the API is genuinely still down after ~26s.
  if (!(await pingApi(20000)) && !(await waitForApi({ maxMs: 20000 }))) {
    toast(tr('error.title'), tr('error.backendWaking'), 'warning');
    await waitForApi();
  }
  try {
    return await fn();
  } catch (error) {
    const raw = String(error?.message || '');
    if (/could not reach|cors|timed out/i.test(raw)) {
      toast(tr('error.title'), tr('error.backendWaking'), 'warning');
      await waitForApi();
      return await fn();
    }
    throw error;
  }
}

function toast(title, message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type === 'warning' ? 'toast-warning' : ''}`;
  item.innerHTML = `<span class="toast-icon">${icon(type === 'warning' ? 'alert' : 'check','icon-sm')}</span><span><strong>${esc(title)}</strong><span>${esc(message)}</span></span>`;
  toastRegion.append(item);
  setTimeout(() => item.remove(), 5200);
}

function openModal({ title, subtitle = '', body, footer = '', wide = false, onOpen }) {
  if (!modalRoot.firstElementChild) modalReturnFocus = document.activeElement;
  if (typeof modalCleanup === 'function') modalCleanup();
  modalCleanup = null;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><div><h2 id="modal-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button class="icon-btn modal-close" type="button" data-action="close-modal" aria-label="${esc(tr('common.close'))}">${icon('x')}</button></header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}</section></div>`;
  document.body.style.overflow = 'hidden';
  modalRoot.querySelector('[autofocus], input:not([disabled]), select:not([disabled]), button:not([disabled])')?.focus();
  modalCleanup = onOpen?.() || null;
}

function closeModal() {
  if (typeof modalCleanup === 'function') modalCleanup();
  modalCleanup = null;
  modalRoot.innerHTML = '';
  document.body.style.overflow = '';
  if (modalReturnFocus instanceof HTMLElement) modalReturnFocus.focus();
  modalReturnFocus = null;
}

function button(action, labelKey, iconName = '', kind = 'btn-primary', extra = '') {
  return `<button class="btn ${kind}" type="button" data-action="${action}" ${extra}>${iconName ? icon(iconName,'icon-sm') : ''}${esc(tr(labelKey))}</button>`;
}

function emptyState(iconName, titleKey, bodyKey, action = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon(iconName)}</span><h3>${esc(tr(titleKey))}</h3><p>${esc(tr(bodyKey))}</p>${action}</div>`;
}

function cardHeader(titleKey, subtitleKey = '', actions = '') {
  return `<div class="card-header"><div><h2 class="card-title">${esc(tr(titleKey))}</h2>${subtitleKey ? `<p class="card-subtitle">${esc(tr(subtitleKey))}</p>` : ''}</div>${actions}</div>`;
}

function metric(iconName, value, labelKey) {
  return `<article class="card metric-card"><div class="metric-top"><span class="metric-icon">${icon(iconName)}</span></div><div class="metric-value">${esc(value)}</div><div class="metric-label">${esc(tr(labelKey))}</div></article>`;
}

function renderLanding() {
  const stats = state.publicStats || {};
  const campaign = state.campaignLanding;
  return `<div class="public-site">
    <header class="public-nav">
      <a class="public-brand" href="#top"><span class="brand-mark">${icon('activity')}</span><span>Rakt<span>Flow</span></span></a>
      <nav class="public-links"><a href="#initiative">The initiative</a><a href="#how">How it works</a><a href="#contact">Contact</a></nav>
      <div class="public-actions"><button class="btn btn-ghost" data-action="open-signin">Sign in</button><button class="btn btn-primary public-donor-button" data-action="open-register">Become a donor ${icon('chevron','icon-sm')}</button></div>
    </header>
    <main id="top">
      ${state.authError ? `<section class="public-error"><strong>Firebase sign-in succeeded, but the operational service could not finish account setup.</strong><span>${esc(state.authError)}</span><div><button class="btn btn-primary" data-action="retry-bootstrap">Retry connection</button><button class="btn btn-secondary" data-action="sign-out">Sign out</button></div><small>API: ${esc(configuredApiOrigin() || 'not configured')}</small></section>` : ''}
      ${campaign ? `<section class="campaign-invite"><span class="section-kicker">Verified drive invitation</span><h1>${esc(campaign.title)}</h1><p>${esc(campaign.description)}</p><div class="campaign-invite-meta"><span>${icon('calendar','icon-sm')} ${esc(fmtDate(campaign.drive.starts_at))}</span><span>${icon('pin','icon-sm')} ${esc(campaign.drive.venue_name || campaign.drive.address)}</span></div><button class="btn btn-primary btn-lg" data-action="campaign-register">Create account or sign in to register</button></section>` : ''}
      <section class="hero-section">
        <div class="hero-glow hero-glow-one"></div><div class="hero-glow hero-glow-two"></div>
        <div class="hero-copy"><div class="hero-kicker"><span class="status-dot"></span> A verified response network built for India</div><h1>Make blood donation easier to coordinate, safer to verify, and faster to act on.</h1><p class="hero-lead">RaktFlow is a community initiative connecting donors, organizers, verified hospitals and blood banks, host venues, and accountable administrators through one privacy-conscious operational system.</p><blockquote>It does not replace a blood bank, doctor, compatibility test, or emergency service. It helps the right authorized people coordinate verified work.</blockquote><div class="hero-actions"><button class="btn btn-primary btn-lg" data-action="open-register">Join as a donor ${icon('chevron')}</button><a class="btn btn-secondary btn-lg" href="#initiative">Understand the initiative</a></div><div class="hero-assurance"><span>${icon('shield','icon-sm')} Verified accounts</span><span>${icon('lock','icon-sm')} Protected donor data</span><span>${icon('activity','icon-sm')} Human clinical decisions</span></div></div>
        <div class="hero-product"><div class="product-window"><div class="product-bar"><span class="product-dots"><i></i><i></i><i></i></span><span>Live operational network</span><span class="badge badge-green">Connected</span></div><div class="product-body"><div class="product-priority"><span class="emergency-pulse">${icon('droplet')}</span><span><small>Verified coordination</small><strong>${stats.upcoming_drives ?? 0} approved drives</strong><em>${stats.recorded_donations ?? 0} clinically recorded donations</em></span></div><div class="initiative-visual"><span class="initiative-node donor-node">${icon('user')} Donor</span><span class="initiative-line"></span><span class="initiative-node">${icon('users')} Organizer</span><span class="initiative-line"></span><span class="initiative-node">${icon('hospital')} Blood bank</span></div><div class="product-metrics"><div><span>Verified needs</span><strong>${stats.verified_active_requests ?? 0}</strong></div><div><span>Upcoming drives</span><strong>${stats.upcoming_drives ?? 0}</strong></div><div><span>Recorded units</span><strong>${stats.recorded_donations ?? 0}</strong></div></div></div></div></div>
      </section>
      <section class="public-section initiative-section" id="initiative"><div class="section-heading"><span class="section-kicker">Why RaktFlow exists</span><h2>A shared operational layer—not another unverified forwarding chain.</h2><p>Blood donation coordination often breaks across disconnected messages, paper lists, uncertain requests, and role confusion. RaktFlow creates a traceable path from a verified account to a scheduled drive, donor registration, protected pre-check, reviewer approval, on-site assessment, collection record, and accountable reconciliation.</p></div><div class="feature-grid"><article><span class="feature-number">01</span><span class="feature-icon">${icon('calendar')}</span><h3>Plan real drives</h3><p>Organizers create drives for Super Admin approval or propose a hosted drive to a venue. Approved schedules become visible to verified donors.</p></article><article><span class="feature-number">02</span><span class="feature-icon">${icon('shield')}</span><h3>Protect clinical boundaries</h3><p>Self-reported blood group and questionnaire answers are never treated as proof. A qualified reviewer controls QR eligibility and on-site staff make the final decision.</p></article><article><span class="feature-number">03</span><span class="feature-icon">${icon('chart')}</span><h3>Replace dummy totals</h3><p>Registration, check-in, clearance, collection, campaign visits, and reconciliation totals come from persisted operational records.</p></article></div></section>
      <section class="safety-section" id="how"><div class="safety-mark">${icon('heart','icon-xl')}</div><div><span class="section-kicker">A careful five-portal workflow</span><h2>Each role sees its own work and every important transition is recorded.</h2><p>Donors manage their profile and registrations. Organizers operate approved drives. Hospital and blood-bank users review clinical queues and verified needs. Host venues decide proposals. Super Admin controls access and oversight.</p></div><ul><li>${icon('check','icon-sm')} No public patient identity</li><li>${icon('check','icon-sm')} No QR before approved pre-check</li><li>${icon('check','icon-sm')} No collection before on-site clearance</li></ul></section>
      <section class="public-cta"><span class="cta-orb">${icon('heart','icon-xl')}</span><div><span class="section-kicker">Start with one verified account</span><h2>Register, complete your profile, and find an approved drive.</h2></div><button class="btn btn-primary btn-lg" data-action="open-register">Become a donor</button></section>
    </main>
    <footer class="public-footer" id="contact"><span class="public-brand"><span class="brand-mark">${icon('activity')}</span><span>Rakt<span>Flow</span></span></span><p><strong>Contact us</strong><br><a href="mailto:${esc(state.publicConfig.contact_email)}">${esc(state.publicConfig.contact_email)}</a> · <a href="tel:+91${esc(state.publicConfig.contact_phone)}">+91 ${esc(state.publicConfig.contact_phone)}</a></p><span>Made with care in India · Clinical decisions remain with qualified professionals.</span></footer>
  </div>`;
}

function renderLoading() {
  return `<main class="auth-loading"><div class="loading-mark"><span class="loading-drop">${icon('droplet','icon-lg')}</span><span class="loading-ring"></span></div><h1>${esc(tr('loading.title'))}</h1><p>${esc(tr(state.loadingKey))}</p><small>${esc(tr('loading.note'))}</small></main>`;
}

function allowedRoles() {
  const roles = state.account?.roles || [];
  return Object.entries(roleConfig).filter(([, config]) => roles.includes(config.claim));
}

function mobileNavigation(nav) {
  const settingsItem = nav.find(([id]) => id === 'settings');
  const primary = nav.filter(([id]) => id !== 'settings').slice(0, settingsItem ? 4 : 5);
  return settingsItem ? [...primary, settingsItem] : primary;
}

function renderApp() {
  const config = roleConfig[state.role];
  const nav = config.nav;
  return `<div class="app-shell">
    <aside class="sidebar ${state.mobileMenu ? 'mobile-open' : ''}"><div class="brand"><span class="brand-mark">${icon('activity')}</span><span class="brand-copy">RaktFlow<div class="brand-sub">${esc(tr('app.verifiedNetwork'))}</div></span></div><div class="role-context"><span class="role-context-label">${esc(tr('app.currentWorkspace'))}</span><span class="role-context-value"><span class="role-dot"></span>${esc(tr(config.label))}</span></div><nav class="side-nav">${nav.map(([id,key,iconName]) => `<button class="nav-item ${state.view === id ? 'active' : ''}" data-view="${id}">${icon(iconName)}<span>${esc(tr(key))}</span></button>`).join('')}</nav><div class="sidebar-foot"><div class="network-card"><span class="network-icon">${icon('shield','icon-sm')}</span><div><strong>${esc(tr('app.secureSession'))}</strong><span>${esc(state.account?.email || '')}</span></div></div></div></aside>
    <section class="main-shell"><header class="topbar"><button class="icon-btn mobile-menu" data-action="toggle-mobile-menu" aria-label="${esc(tr('common.menu'))}">${icon('menu')}</button><div class="page-identity"><span class="page-eyebrow">${esc(tr(config.label))}</span><h2 class="page-title">${esc(tr(nav.find(([id]) => id === state.view)?.[1] || config.label))}</h2></div><div class="top-actions"><label class="language-picker">${icon('language','icon-sm')}<select data-action="change-language" aria-label="${esc(tr('common.language'))}">${languages.map(([code,label]) => `<option value="${code}" ${state.locale === code ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="role-switcher"><button class="btn btn-secondary role-button" data-action="toggle-role-menu">${icon(config.icon,'icon-sm')}<span>${esc(tr(config.label))}</span>${icon('chevron','icon-sm')}</button>${state.roleMenu ? `<div class="role-menu">${allowedRoles().map(([id,item]) => `<button class="role-option" data-role="${id}"><span class="role-option-icon">${icon(item.icon)}</span><span><strong>${esc(tr(item.label))}</strong></span></button>`).join('')}</div>` : ''}</div><button class="icon-btn" data-action="toggle-theme" aria-label="${esc(tr('common.theme'))}">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button><button class="account-button" data-action="open-settings" aria-label="${esc(tr('nav.settings'))}"><span class="avatar">${esc((state.profile?.full_name || state.account?.email || 'RF').slice(0,2).toUpperCase())}</span></button></div></header><main class="content" id="main-content">${renderRolePage()}<footer class="in-app-footer"><span>${icon('heart','icon-sm')} ${esc(tr('footer.madeInIndia'))}</span><span><a href="mailto:${esc(state.publicConfig.contact_email)}">${esc(state.publicConfig.contact_email)}</a> · <a href="tel:+91${esc(state.publicConfig.contact_phone)}">+91 ${esc(state.publicConfig.contact_phone)}</a></span><span class="build-tag">${BUILD_TAG}</span></footer></main></section>
    <nav class="mobile-bottom-nav" aria-label="${esc(tr(config.label))}">${mobileNavigation(nav).map(([id,key,iconName]) => `<button class="bottom-nav-item ${state.view === id ? 'active' : ''}" data-view="${id}">${icon(iconName)}<span>${esc(tr(key))}</span></button>`).join('')}</nav>
  </div>`;
}

function renderRolePage() {
  if (state.view === 'settings') return renderSettings();
  if (state.role === 'donor') return renderDonor();
  if (state.role === 'organizer') return renderOrganizer();
  if (state.role === 'hospital') return renderHospital();
  if (state.role === 'venue') return renderVenue();
  return renderAdmin();
}

function pageHeader(titleKey, subtitleKey, actions = '') {
  return `<div class="page-header"><div><h1>${esc(tr(titleKey))}</h1><p>${esc(tr(subtitleKey))}</p></div>${actions ? `<div class="page-header-actions">${actions}</div>` : ''}</div>`;
}

function renderSettings() {
  const roles = allowedRoles();
  const preferences = state.preferences || {};
  const appearance = preferences.appearance || state.theme.toUpperCase();
  const toggle = (name, titleKey, helpKey) => `<label class="preference-toggle"><span><strong>${esc(tr(titleKey))}</strong><small>${esc(tr(helpKey))}</small></span><input type="checkbox" data-preference="${name}" ${preferences[name] ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
  return `${pageHeader('settings.title','settings.subtitle',button('save-preferences','settings.savePreferences','check'))}
    <div class="settings-grid">
      <section class="card settings-card">${cardHeader('settings.appearance','settings.appearanceHelp')}<div class="card-body settings-options"><button class="setting-choice ${appearance === 'LIGHT' ? 'active' : ''}" data-action="set-appearance" data-appearance="LIGHT">${icon('sun')}<span><strong>${esc(tr('settings.light'))}</strong><small>${esc(tr('settings.lightHelp'))}</small></span>${appearance === 'LIGHT' ? icon('check','icon-sm') : ''}</button><button class="setting-choice ${appearance === 'DARK' ? 'active' : ''}" data-action="set-appearance" data-appearance="DARK">${icon('moon')}<span><strong>${esc(tr('settings.dark'))}</strong><small>${esc(tr('settings.darkHelp'))}</small></span>${appearance === 'DARK' ? icon('check','icon-sm') : ''}</button><button class="setting-choice ${appearance === 'SYSTEM' ? 'active' : ''}" data-action="set-appearance" data-appearance="SYSTEM">${icon('settings')}<span><strong>${esc(tr('settings.system'))}</strong><small>${esc(tr('settings.systemHelp'))}</small></span>${appearance === 'SYSTEM' ? icon('check','icon-sm') : ''}</button></div></section>
      <section class="card settings-card">${cardHeader('settings.language','settings.languageHelp')}<div class="card-body"><label class="field"><span>${esc(tr('common.language'))}</span><select class="select" data-action="change-language">${languages.map(([code,label]) => `<option value="${code}" ${state.locale === code ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p class="muted">${esc(tr('settings.authenticatedLanguage'))}</p></div></section>
      <section class="card settings-card span-2">${cardHeader('settings.workspaces','settings.workspacesHelp')}<div class="card-body settings-workspaces">${roles.map(([id,item]) => `<button class="workspace-choice ${state.role === id ? 'active' : ''}" data-role="${id}">${icon(item.icon)}<span><strong>${esc(tr(item.label))}</strong><small>${esc(tr('settings.serverAssigned'))}</small></span>${state.role === id ? icon('check','icon-sm') : icon('chevron','icon-sm')}</button>`).join('')}</div></section>
      <section class="card settings-card">${cardHeader('settings.account','settings.accountHelp')}<div class="card-body settings-account"><span class="account-avatar">${esc((state.profile?.full_name || state.account?.email || 'RF').slice(0,2).toUpperCase())}</span><div><strong>${esc(state.profile?.full_name || state.account?.email || '')}</strong><small>${esc(state.account?.email || '')}</small></div>${state.account?.roles?.includes('ROLE_DONOR') ? `<button class="btn btn-secondary" data-action="open-profile">${icon('user','icon-sm')} ${esc(tr(state.profile ? 'common.editProfile' : 'common.completeProfile'))}</button>` : ''}<button class="btn btn-secondary" data-action="sign-out">${esc(tr('common.signOut'))}</button></div></section>
      <section class="card settings-card">${cardHeader('settings.notifications','settings.notificationsHelp')}<div class="card-body preference-list">${toggle('in_app_notifications','settings.inApp','settings.inAppHelp')}${toggle('email_notifications','settings.email','settings.emailHelp')}${toggle('sms_notifications','settings.sms','settings.smsHelp')}</div></section>
      <section class="card settings-card span-2">${cardHeader('settings.privacy','settings.privacyHelp')}<div class="card-body preference-list">${toggle('rare_blood_opt_in','settings.rareBlood','settings.rareBloodHelp')}${toggle('location_matching_opt_in','settings.locationMatching','settings.locationMatchingHelp')}${toggle('donation_lifecycle_opt_in','settings.lifecycle','settings.lifecycleHelp')}<div class="setting-notes"><p>${icon('lock','icon-sm')} ${esc(tr('settings.qrPrivacy'))}</p><p>${icon('shield','icon-sm')} ${esc(tr('settings.clinicalPrivacy'))}</p></div><div class="privacy-actions"><button class="btn btn-secondary" data-action="download-personal-data">${icon('download','icon-sm')} ${esc(tr('privacy.export'))}</button><button class="btn btn-secondary" data-action="privacy-request">${icon('file','icon-sm')} ${esc(tr('privacy.request'))}</button></div>${state.privacyRequests.length ? `<div class="privacy-request-list"><strong>${esc(tr('privacy.myRequests'))}</strong>${state.privacyRequests.slice(0,5).map(item => `<p><span>${esc(domainLabel('privacyRequest',item.request_type))}</span>${statusBadge(item.status)}<small>${esc(fmtDate(item.created_at))}</small></p>`).join('')}</div>` : ''}</div></section>
    </div>`;
}

function renderDonor() {
  if (state.view === 'drives') return donorDrives();
  if (state.view === 'needs') return donorNeeds();
  if (state.view === 'history') return donorHistory();
  if (state.view === 'pass') return donorPassPage();
  return donorHome();
}

function donorHome() {
  const profile = state.profile;
  const review = profile?.screening_review_status;
  const profileComplete = Boolean(profile);
  const qrReady = review === 'APPROVED' && profile?.blood_type !== 'UNKNOWN';
  const upcoming = state.registrations.filter(item => ['REGISTERED','CHECKED_IN'].includes(item.status));
  return `${pageHeader('donor.homeTitle','donor.homeSubtitle',button('open-profile',profile ? 'common.editProfile' : 'common.completeProfile','user','btn-secondary') + button('open-screening','donor.precheckAction','shield','btn-secondary'))}
    ${state.campaignLanding ? `<section class="emergency-strip"><span class="emergency-pulse">${icon('calendar')}</span><span class="emergency-copy"><strong>${esc(state.campaignLanding.title)}</strong><span>${esc(fmtDate(state.campaignLanding.drive.starts_at))} · ${esc(state.campaignLanding.drive.venue_name)}</span></span><button class="btn" data-action="register-campaign">${esc(tr('donor.registerNow'))}</button></section>` : ''}
    <div class="journey-grid"><article class="journey-card ${profileComplete ? 'complete' : 'current'}"><span class="journey-number">1</span><div><strong>${esc(tr('donor.stepProfile'))}</strong><p>${esc(profileComplete ? tr('donor.profileComplete') : tr('donor.profileMissing'))}</p>${profile ? `<span class="badge badge-neutral">${esc(profile.blood_type)} · ${esc(profile.city || '')}</span>` : ''}</div><button class="btn btn-secondary btn-sm" data-action="open-profile">${esc(tr(profileComplete ? 'common.edit' : 'common.start'))}</button></article><article class="journey-card ${review === 'PENDING' ? 'current' : review ? 'complete' : ''}"><span class="journey-number">2</span><div><strong>${esc(tr('donor.stepPrecheck'))}</strong><p>${esc(review ? statusLabel(review) : tr('donor.precheckMissing'))}</p>${review === 'PENDING' ? `<small class="muted">${esc(tr('donor.refreshReviewHelp'))}</small>` : ''}${profile?.eligible_on ? `<div class="eligibility-countdown"><strong>${esc(tr('screening.earliestReview'))}: ${esc(new Intl.DateTimeFormat(state.locale,{dateStyle:'medium'}).format(new Date(`${profile.eligible_on}T00:00:00`)))}</strong><small>${esc((profile.deferral_reason_codes || []).map(code => statusLabel(code)).join(', '))}</small></div>` : ''}</div><button class="btn btn-secondary btn-sm" data-action="${review === 'PENDING' ? 'refresh-eligibility' : 'open-screening'}">${esc(tr(review === 'PENDING' ? 'common.refresh' : 'donor.precheckAction'))}</button></article><article class="journey-card ${qrReady ? 'complete' : ''}"><span class="journey-number">3</span><div><strong>${esc(tr('donor.stepPass'))}</strong><p>${esc(qrReady ? tr('donor.passReady') : tr('donor.passLocked'))}</p></div><button class="btn btn-secondary btn-sm" data-action="open-pass" ${qrReady ? '' : 'disabled'}>${esc(tr('donor.showPass'))}</button></article></div>
    <div class="grid grid-3"><section class="card span-2">${cardHeader('donor.upcomingRegistrations','donor.upcomingRegistrationsHelp',button('go-drives','common.browse','calendar','btn-ghost btn-sm'))}<div class="card-body activity-list">${upcoming.length ? upcoming.slice(0,5).map(item => `<div class="activity-item"><span class="activity-icon">${icon('calendar')}</span><span class="activity-copy"><strong>${esc(item.drive.name)}</strong><span>${esc(fmtDate(item.drive.starts_at))} · ${esc(item.drive.venue_name || item.drive.address)}</span></span>${statusBadge(item.status)}</div>`).join('') : emptyState('calendar','donor.noRegistrations','donor.noRegistrationsHelp',button('go-drives','common.findDrive','pin','btn-primary btn-sm'))}</div></section><aside class="stack"><article class="card">${cardHeader('donor.profileSummary','donor.profileSummaryHelp')}<div class="card-body profile-summary"><div><span>${esc(tr('common.reference'))}</span><strong>${esc(profile?.reference_code || tr('common.notSet'))}</strong></div><div><span>${esc(tr('common.name'))}</span><strong>${esc(profile?.full_name || tr('common.notSet'))}</strong></div><div><span>${esc(tr('common.bloodGroup'))}</span><strong>${esc(profile?.blood_type || tr('common.notSet'))}</strong></div><div><span>${esc(tr('common.city'))}</span><strong>${esc(profile?.city || tr('common.notSet'))}</strong></div></div></article><article class="card">${cardHeader('donor.liveNeeds','donor.liveNeedsHelp')}<div class="card-body"><strong class="big-count">${state.publicRequests.length}</strong><p class="muted">${esc(tr('donor.verifiedNeedsCount'))}</p><button class="btn btn-secondary" data-view="needs">${esc(tr('common.view'))}</button></div></article></aside></div>`;
}

function donorNearbyMap() {
  if (!Number.isFinite(state.profile?.latitude) || !Number.isFinite(state.profile?.longitude)) return '';
  const distanceText = item => item.distance_km == null ? '' : ` · ${item.distance_km} ${tr('map.kilometres')}`;
  const pins = [
    ...state.publicDrives.map(item => ({ kind:'drive', latitude:Number(item.latitude), longitude:Number(item.longitude), label:`${item.name}${distanceText(item)}` })),
    ...state.publicCentres.map(item => ({ kind:'centre', latitude:Number(item.latitude), longitude:Number(item.longitude), label:`${item.name}${distanceText(item)}` })),
    ...state.publicBanks.map(item => ({ kind:'bank', latitude:Number(item.latitude), longitude:Number(item.longitude), label:`${item.name} · ${item.city}, ${item.state}` })),
    ...state.publicRequests.map(item => ({ kind:'need', latitude:Number(item.latitude), longitude:Number(item.longitude), label:`${item.facility_name} · ${item.blood_type}${distanceText(item)}` }))
  ];
  return `${miniMapMarkup({
    id:'donor-nearby-map',
    center:{ latitude:state.profile.latitude, longitude:state.profile.longitude, label:state.profile.city },
    pins,
    title:tr('map.nearbyTitle'), subtitle:tr('map.nearbySubtitle'), emptyLabel:tr('map.empty'),
    legend:{ drive:tr('map.drive'), centre:tr('map.centre'), bank:tr('map.bank'), need:tr('map.need') }
  })}<p class="muted map-note">${esc(tr('map.bankNote'))}</p>`;
}

function donorDrives() {
  const registeredIds = new Set(state.registrations.filter(item => item.status !== 'CANCELLED').map(item => item.drive.id));
  return `${pageHeader('donor.drivesTitle','donor.drivesSubtitle',button('refresh-donor','common.refresh','refresh','btn-secondary'))}${donorNearbyMap()}<div class="drive-grid">${state.publicDrives.length ? state.publicDrives.map(drive => `<article class="card drive-card"><div class="drive-date"><strong>${new Date(drive.starts_at).getDate()}</strong><span>${new Intl.DateTimeFormat(state.locale,{month:'short'}).format(new Date(drive.starts_at))}</span></div><div class="drive-main"><div class="drive-title-row"><h2>${esc(drive.name)}</h2>${statusBadge(drive.status)}</div><p>${icon('pin','icon-sm')} ${esc(drive.venue_name || drive.address)}</p><p>${icon('calendar','icon-sm')} ${esc(fmtDate(drive.starts_at))}</p>${drive.distance_km != null ? `<span class="badge badge-blue">${esc(drive.distance_km)} ${esc(tr('map.kilometres'))}</span>` : ''}<span class="badge badge-neutral">${esc(tr('common.target'))}: ${drive.target_units}</span></div><div class="drive-actions">${registeredIds.has(drive.id) ? `<span class="badge badge-green">${esc(tr('status.registered'))}</span>` : `<button class="btn btn-primary" data-action="register-drive" data-drive-id="${drive.id}">${esc(tr('donor.registerNow'))}</button>`}</div></article>`).join('') : emptyState('calendar','donor.noDrives','donor.noDrivesHelp',button('enable-local-alerts','privacy.alertPreferences','settings','btn-primary'))}</div>`;
}

function donorNeeds() {
  const alertCards = state.donorAlerts.map(item => `<article class="card request-card rare-alert-card"><div class="request-type">${esc(item.blood_type)}</div><div><div class="drive-title-row"><h2>${esc(tr('rare.standbyRequest'))}</h2>${statusBadge(item.response)}</div><p>${esc(domainLabel('component',item.component_type))} · ${item.units_needed} ${esc(tr('common.units'))} · ${esc(item.facility_name)}</p><p>${esc(tr('rare.responseDeadline'))}: ${esc(fmtDate(item.response_deadline))} · ${esc(tr('rare.tier'))} ${item.tier}</p><small>${esc(tr('rare.noPatientIdentity'))}</small></div>${item.can_respond ? `<div class="drive-actions"><button class="btn btn-primary" data-action="respond-rare-alert" data-alert-id="${item.id}" data-response="ACCEPTED">${esc(tr('rare.canRespond'))}</button><button class="btn btn-secondary" data-action="respond-rare-alert" data-alert-id="${item.id}" data-response="DECLINED">${esc(tr('rare.cannotRespond'))}</button></div>` : ''}</article>`).join('');
  const publicCards = state.publicRequests.length ? state.publicRequests.map(item => `<article class="card request-card"><div class="request-type">${esc(item.blood_type)}</div><div><h2>${esc(domainLabel('component', item.component_type))} · ${item.units_needed} ${esc(tr('common.units'))}</h2><p>${esc(item.facility_name)} · ${esc(item.city)}, ${esc(item.state)}${item.distance_km != null ? ` · ${esc(item.distance_km)} ${esc(tr('map.kilometres'))}` : ''}</p><p>${esc(tr('common.expires'))}: ${esc(fmtDate(item.expires_at))}</p></div>${statusBadge('VERIFIED')}</article>`).join('') : emptyState('shield','donor.noNeeds','donor.noNeedsHelp',button('enable-local-alerts','privacy.alertPreferences','settings','btn-primary'));
  return `${pageHeader('donor.needsTitle','donor.needsSubtitle',button('refresh-donor','common.refresh','refresh','btn-secondary'))}${alertCards ? `<section class="stack rare-alerts"><div class="section-heading"><div><h2>${esc(tr('rare.myAlerts'))}</h2><p>${esc(tr('rare.myAlertsHelp'))}</p></div></div>${alertCards}</section>` : ''}${donorNearbyMap()}<div class="stack">${publicCards}</div>`;
}

function donorHistory() {
  const notifications = state.donorUnitNotifications.map(item => `<article class="lifecycle-notice ${item.read_at ? '' : 'unread'}"><span>${icon('heart')}</span><div><strong>${esc(tr('lifecycle.whereItWent'))}</strong><p>${esc(item.message)}</p><small>${esc(fmtDate(item.created_at))}</small></div>${item.read_at ? '' : `<button class="btn btn-secondary btn-sm" data-action="read-unit-notification" data-notification-id="${item.id}">${esc(tr('common.markRead'))}</button>`}</article>`).join('');
  return `${pageHeader('donor.historyTitle','donor.historySubtitle')}${notifications ? `<section class="stack lifecycle-notices">${notifications}</section>` : ''}<div class="stack donation-lifecycle-list">${state.donationHistory.length ? state.donationHistory.map(item => `<article class="card card-pad"><div class="drive-title-row"><div><span class="section-label">${esc(fmtDate(item.collected_at))}</span><h2>${esc(item.drive_name)}</h2><p>${esc(item.venue_name || '')}</p></div><span class="blood-stock-type">${esc(item.blood_type)}</span></div><p><strong>${esc(tr('common.unitReference'))}:</strong> ${esc(item.unit_reference)}</p><div class="lifecycle-track">${(item.components || []).map(component => `<div class="lifecycle-step ${component.status === 'TRANSFUSED' ? 'used' : ''}"><span>${icon(component.status === 'TRANSFUSED' ? 'heart' : 'droplet','icon-sm')}</span><div><strong>${esc(domainLabel('component', component.component_type))}</strong><small>${esc(statusLabel(component.status))}</small>${component.privacy_message ? `<p>${esc(component.privacy_message)}</p>` : ''}</div></div>`).join('') || `<p class="muted">${esc(tr('lifecycle.awaitingTracking'))}</p>`}</div><p class="muted">${esc(tr('lifecycle.noPatientIdentity'))}</p></article>`).join('') : emptyState('file','donor.noHistory','donor.noHistoryHelp')}</div>`;
}

function donorPassPage() {
  const ready = state.profile?.screening_review_status === 'APPROVED' && state.profile?.blood_type !== 'UNKNOWN';
  return `${pageHeader('donor.passTitle','donor.passSubtitle',ready ? button('open-pass','donor.generatePass','qr') : '')}<article class="card"><div class="card-body">${ready ? `<div class="pass-ready-panel"><span class="metric-icon">${icon('shield')}</span><h2>${esc(tr('donor.passApproved'))}</h2><p>${esc(tr('donor.passSafety'))}</p><div class="manual-reference-card"><span>${esc(tr('donor.manualReference'))}</span><strong>${esc(state.profile?.reference_code || '')}</strong><small>${esc(tr('donor.manualReferenceHelp'))}</small></div><button class="btn btn-primary btn-lg" data-action="open-pass">${icon('qr')} ${esc(tr('donor.generatePass'))}</button></div>` : emptyState('lock','donor.passNotReady','donor.passRequirements',button('open-profile','common.completeProfile','user','btn-secondary') + button('open-screening','donor.precheckAction','shield','btn-primary'))}</div></article>`;
}

function renderOrganizer() {
  if (state.view === 'drives') return organizerDrives();
  if (state.view === 'campaigns') return organizerCampaigns();
  if (state.view === 'intake') return organizerIntake();
  if (state.view === 'roster') return organizerRoster();
  if (state.view === 'reconcile') return organizerReconciliation();
  return organizerOverview();
}

function activeDrive() {
  return state.drives.find(item => item.id === state.activeDriveId) || state.drives[0] || null;
}

function driveSelector() {
  return state.drives.length ? `<select class="select drive-selector" data-action="select-drive">${state.drives.map(drive => `<option value="${drive.id}" ${drive.id === state.activeDriveId ? 'selected' : ''}>${esc(drive.name)} · ${esc(statusLabel(drive.status))}</option>`).join('')}</select>` : '';
}

function organizerOverview() {
  const drive = activeDrive();
  const rec = state.reconciliation;
  return `${pageHeader('organizer.overviewTitle','organizer.overviewSubtitle',button('create-drive','organizer.createDrive','plus') + button('create-proposal','organizer.proposeDrive','mail','btn-secondary'))}<div class="workflow-explainer"><div><span>1</span><strong>${esc(tr('organizer.createDrive'))}</strong><p>${esc(tr('organizer.createDriveHelp'))}</p></div><div><span>2</span><strong>${esc(tr('organizer.proposeDrive'))}</strong><p>${esc(tr('organizer.proposeDriveHelp'))}</p></div></div><div class="grid grid-4 metric-grid-mobile">${metric('calendar',String(state.drives.length),'organizer.totalDrives')}${metric('users',String(rec?.registrations || 0),'organizer.registrations')}${metric('scan',String(rec?.checkins || 0),'organizer.checkins')}${metric('droplet',String(rec?.units_logged || 0),'organizer.unitsLogged')}</div><article class="card" style="margin-top:18px">${cardHeader('organizer.activeDrive','organizer.activeDriveHelp',driveSelector())}<div class="card-body">${drive ? `<div class="drive-summary"><div><h2>${esc(drive.name)}</h2><p>${esc(drive.venue_name || drive.address)}</p><p>${esc(fmtDate(drive.starts_at))}</p></div>${statusBadge(drive.status)}</div><div class="progress rose"><span style="width:${Math.min(100,rec?.target_completion_percent || 0)}%"></span></div><p class="muted">${esc(tr('organizer.approvalNotice'))}</p>` : emptyState('calendar','organizer.noDrives','organizer.noDrivesHelp',button('create-drive','organizer.createDrive','plus'))}</div></article>`;
}

function organizerDrives() {
  return `${pageHeader('organizer.drivesTitle','organizer.drivesSubtitle',button('create-drive','organizer.createDrive','plus') + button('create-proposal','organizer.proposeDrive','mail','btn-secondary'))}<div class="stack">${state.drives.length ? state.drives.map(drive => `<article class="card drive-card"><div class="drive-main"><div class="drive-title-row"><h2>${esc(drive.name)}</h2>${statusBadge(drive.status)}</div><p>${esc(drive.venue_name || drive.address)}</p><p>${esc(fmtDate(drive.starts_at))} — ${esc(fmtDate(drive.ends_at))}</p><span class="badge badge-neutral">${esc(tr('common.target'))}: ${drive.target_units}</span></div>${drive.summary ? `<div class="drive-metrics"><span>${esc(tr('organizer.registrations'))}: ${drive.summary.registrations ?? 0}</span><span>${esc(tr('organizer.checkins'))}: ${drive.summary.checkins ?? 0}</span><span>${esc(tr('organizer.unitsLogged'))}: ${drive.summary.units_logged ?? 0}</span><span>${esc(tr('organizer.cleared'))}: ${drive.summary.cleared ?? 0}</span></div>` : ''}<div class="drive-actions"><button class="btn btn-secondary btn-sm" data-action="select-drive-card" data-drive-id="${drive.id}">${esc(tr('common.manage'))}</button><button class="btn btn-secondary btn-sm" data-action="select-drive-roster" data-drive-id="${drive.id}">${esc(tr('nav.roster'))}</button><button class="btn btn-secondary btn-sm" data-action="select-drive-report" data-drive-id="${drive.id}">${esc(tr('organizer.report'))}</button><button class="btn btn-secondary btn-sm" data-action="manage-quotas" data-drive-id="${drive.id}">${esc(tr('quota.manage'))}</button>${drive.status === 'APPROVED' ? `<button class="btn btn-primary btn-sm" data-action="drive-status" data-drive-id="${drive.id}" data-status="ACTIVE">${esc(tr('organizer.startDrive'))}</button>` : ''}${drive.status === 'ACTIVE' ? `<button class="btn btn-primary btn-sm" data-action="drive-status" data-drive-id="${drive.id}" data-status="COMPLETED">${esc(tr('organizer.completeDrive'))}</button>` : ''}</div></article>`).join('') : emptyState('calendar','organizer.noDrives','organizer.noDrivesHelp',button('create-drive','organizer.createDrive','plus'))}</div><section style="margin-top:22px">${cardHeader('venue.proposalsTitle','venue.proposalsSubtitle')}<div class="stack">${state.proposals.length ? state.proposals.map(proposal => `<article class="card compact-card"><div><strong>${esc(proposal.proposed_name)}</strong><p>${esc(proposal.venue_name)} · ${esc(proposal.host_email)}</p></div>${statusBadge(proposal.status)}</article>`).join('') : emptyState('mail','venue.noProposals','venue.noProposalsHelp')}</div></section>`;
}

function organizerCampaigns() {
  const campaign = state.campaigns.find(item => item.id === state.selectedCampaignId) || state.campaigns[0];
  const stats = campaign ? state.campaignStats[campaign.id] : null;
  return `${pageHeader('campaign.title','campaign.subtitle',button('create-campaign','campaign.create','plus'))}${campaign ? `<div class="grid grid-3"><section class="card span-2">${cardHeader('campaign.preview','campaign.previewHelp',statusBadge(campaign.status))}<div class="card-body"><div class="poster-preview" style="--poster-accent:${esc(campaign.poster?.accent_color || '#e11d48')}"><span class="poster-brand">RaktFlow</span><div class="poster-art">${icon('droplet','icon-xl')}</div><small>${esc(campaign.poster?.organizer_name || '')}</small><h2>${esc(campaign.poster?.headline || campaign.title)}</h2><p>${esc(campaign.poster?.subheading || campaign.description)}</p><strong>${esc(fmtDate(campaign.drive.starts_at))}</strong><span>${esc(campaign.drive.venue_name || campaign.drive.address)}</span><b>${esc(campaign.poster?.call_to_action || tr('campaign.register'))}</b></div></div></section><aside class="stack"><article class="card">${cardHeader('campaign.realMetrics','campaign.realMetricsHelp')}<div class="card-body campaign-metrics"><div><strong>${stats?.unique_visitors ?? 0}</strong><span>${esc(tr('campaign.visitors'))}</span></div><div><strong>${stats?.registrations ?? 0}</strong><span>${esc(tr('campaign.registrations'))}</span></div><div><strong>${stats?.conversion_percent ?? 0}%</strong><span>${esc(tr('campaign.conversion'))}</span></div></div></article><article class="card"><div class="card-body stack"><button class="btn btn-secondary" data-action="edit-campaign" data-campaign-id="${campaign.id}">${icon('settings','icon-sm')} ${esc(tr('common.edit'))}</button>${campaign.status === 'DRAFT' ? `<button class="btn btn-primary" data-action="publish-campaign" data-campaign-id="${campaign.id}">${icon('check','icon-sm')} ${esc(tr('campaign.publish'))}</button>` : ''}<button class="btn btn-secondary" data-action="copy-campaign-link" data-campaign-id="${campaign.id}">${icon('copy','icon-sm')} ${esc(tr('campaign.copyLink'))}</button><button class="btn btn-secondary" data-action="download-campaign-qr" data-campaign-id="${campaign.id}">${icon('qr','icon-sm')} ${esc(tr('campaign.downloadQr'))}</button><button class="btn btn-secondary" data-action="download-poster" data-campaign-id="${campaign.id}">${icon('download','icon-sm')} ${esc(tr('campaign.downloadPoster'))}</button><button class="btn btn-primary" data-action="email-campaign" data-campaign-id="${campaign.id}">${icon('mail','icon-sm')} ${esc(tr('campaign.email'))}</button></div></article></aside></div><div class="campaign-list">${state.campaigns.map(item => `<button class="campaign-chip ${item.id === campaign.id ? 'active' : ''}" data-action="select-campaign" data-campaign-id="${item.id}">${esc(item.title)} ${statusBadge(item.status)}</button>`).join('')}</div>` : `<article class="card">${emptyState('link','campaign.empty','campaign.emptyHelp',button('create-campaign','campaign.create','plus'))}</article>`}`;
}

function organizerIntake() {
  const drive = activeDrive();
  const allowed = state.online && drive && ['APPROVED','ACTIVE'].includes(drive.status);
  return `${pageHeader('intake.title','intake.subtitle',driveSelector())}<div class="scanner-layout"><section class="card card-pad"><div class="inline-scanner"><video id="qr-video" class="qr-video" playsinline muted></video><div class="scan-reticle"><span class="scan-line"></span></div><div class="scanner-status" id="scanner-status">${esc(tr('intake.cameraIdle'))}</div></div><div class="scan-actions"><button class="btn btn-primary" data-action="start-camera" ${allowed ? '' : 'disabled'}>${icon('camera','icon-sm')} ${esc(tr('intake.openCamera'))}</button><button class="btn btn-secondary" data-action="stop-camera" hidden>${esc(tr('common.stop'))}</button><label class="btn btn-secondary file-button ${allowed ? '' : 'disabled'}">${icon('upload','icon-sm')} ${esc(tr('intake.scanPhoto'))}<input id="qr-image-input" type="file" accept="image/*" capture="environment" ${allowed ? '' : 'disabled'} hidden></label></div><div class="field" style="margin-top:18px"><label for="manual-reference">${esc(tr('intake.manualReference'))}</label><div class="input-action"><input class="input" id="manual-reference" placeholder="RF-1234ABCD"><button class="btn btn-secondary" data-action="manual-checkin" ${allowed ? '' : 'disabled'}>${esc(tr('intake.checkIn'))}</button></div></div>${!allowed ? `<div class="config-warning">${icon('alert','icon-sm')} ${esc(tr(state.online ? 'intake.approvedDriveRequired' : 'intake.onlineRequired'))}</div>` : ''}</section><aside class="card">${cardHeader('intake.donorCard','intake.donorCardHelp')}<div class="card-body">${state.intakeDonor ? `<div class="intake-person"><span class="avatar">${esc(state.intakeDonor.display_name.slice(0,2).toUpperCase())}</span><div><h2>${esc(state.intakeDonor.display_name)}</h2><p>${esc(state.intakeDonor.donor_reference)} · ${esc(state.intakeDonor.blood_type)}</p></div></div><div class="profile-summary"><div><span>${esc(tr('intake.precheck'))}</span><strong>${esc(statusLabel(state.intakeDonor.latest_screening_outcome))}</strong></div><div><span>${esc(tr('intake.clearance'))}</span><strong>${esc(statusLabel(state.intakeDonor.clearance_status))}</strong></div></div>${state.intakeDonor.screening ? precheckSummaryMarkup(state.intakeDonor.screening) : ''}${state.account.roles.includes('ROLE_HOSPITAL') || state.account.roles.includes('ROLE_SUPER_ADMIN') ? `<button class="btn btn-primary" data-action="clinical-assessment">${esc(tr('intake.assess'))}</button>` : ''}<button class="btn btn-secondary" data-action="record-donation" ${state.intakeDonor.clearance_status === 'CLEARED' ? '' : 'disabled'}>${esc(tr('intake.recordDonation'))}</button>` : emptyState('scan','intake.ready','intake.readyHelp')}</div></aside></div>`;
}

const SCREENING_YES_FIELDS = [
  ['fever_infection_or_antibiotics','screening.infection'],
  ['medication_requires_review','screening.medication'],
  ['heart_lung_kidney_liver_or_bleeding_condition','screening.conditions'],
  ['surgery_transfusion_or_hospitalization_last_12_months','screening.procedure'],
  ['tattoo_or_piercing_last_12_months','screening.tattoo'],
  ['malaria_risk_travel_or_residence','screening.travel'],
  ['pregnancy_breastfeeding_or_recent_delivery','screening.pregnancy'],
  ['alcohol_within_24_hours','screening.alcohol24h'],
  ['recent_immunization_14_days','screening.immunization14d']
];
const SCREENING_DATE_FIELDS = [
  ['last_donation_date','screening.lastDonation'],
  ['antibiotics_completed_date','screening.antibioticsCompleted'],
  ['surgery_or_transfusion_date','screening.surgeryDate'],
  ['tattoo_or_piercing_date','screening.tattooDate'],
  ['malaria_risk_return_date','screening.travelReturnDate'],
  ['delivery_or_pregnancy_end_date','screening.pregnancyEndDate']
];

function precheckSummaryMarkup(summary) {
  if (!summary) return '';
  const items = [];
  if (summary.weight_kg != null) items.push({ label: tr('screening.weight'), value: `${summary.weight_kg} kg` });
  for (const [key, labelKey] of SCREENING_YES_FIELDS) {
    if (summary[key] === true) items.push({ label: tr(labelKey), value: tr('common.yes') });
  }
  for (const [key, labelKey] of SCREENING_DATE_FIELDS) {
    if (summary[key]) items.push({ label: tr(labelKey), value: new Intl.DateTimeFormat(state.locale,{dateStyle:'medium'}).format(new Date(`${summary[key]}T00:00:00`)) });
  }
  const flags = summary.flags || [];
  return `<div class="precheck-summary"><div class="precheck-summary-head">${icon('shield','icon-sm')} ${esc(tr('intake.precheckAnswers'))}</div>${items.length ? `<div class="precheck-answer-grid">${items.map(item => `<span><small>${esc(item.label)}</small><strong>${esc(item.value)}</strong></span>`).join('')}</div>` : `<small class="muted">${esc(tr('intake.noPrecheck'))}</small>`}${flags.length ? `<div class="flag-list">${flags.map(flag => `<span class="badge badge-amber">${esc(statusLabel(flag))}</span>`).join('')}</div>` : ''}</div>`;
}

function organizerRoster() {
  return `${pageHeader('roster.title','roster.subtitle',driveSelector())}<article class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>${esc(tr('common.donor'))}</th><th>${esc(tr('common.bloodGroup'))}</th><th>${esc(tr('roster.registration'))}</th><th>${esc(tr('roster.checkin'))}</th><th>${esc(tr('roster.clearance'))}</th><th>${esc(tr('roster.unit'))}</th></tr></thead><tbody>${state.roster.length ? state.roster.map(item => `<tr><td><strong>${esc(item.display_name)}</strong><br><span class="muted">${esc(item.donor_reference)}</span></td><td>${esc(item.blood_type)}</td><td>${statusBadge(item.registration_status)}</td><td>${item.checked_in_at ? esc(fmtDate(item.checked_in_at)) : esc(tr('common.none'))}</td><td>${statusBadge(item.clearance_status)}</td><td>${esc(item.unit_reference || tr('common.none'))}</td></tr>`).join('') : `<tr><td colspan="6">${emptyState('users','roster.empty','roster.emptyHelp')}</td></tr>`}</tbody></table></div></article>`;
}

function organizerReconciliation() {
  const rec = state.reconciliation;
  return `${pageHeader('reconcile.title','reconcile.subtitle',driveSelector())}${rec ? `<div class="grid grid-4 metric-grid-mobile">${metric('users',String(rec.registrations),'organizer.registrations')}${metric('scan',String(rec.checkins),'organizer.checkins')}${metric('shield',String(rec.cleared),'reconcile.cleared')}${metric('droplet',String(rec.units_logged),'organizer.unitsLogged')}</div><article class="card" style="margin-top:18px"><div class="table-wrap"><table class="data-table"><thead><tr><th>${esc(tr('common.donor'))}</th><th>${esc(tr('common.unitReference'))}</th><th>${esc(tr('common.component'))}</th><th>${esc(tr('common.bloodGroup'))}</th><th>${esc(tr('common.volume'))}</th><th>${esc(tr('common.date'))}</th></tr></thead><tbody>${rec.records.length ? rec.records.map(item => `<tr><td>${esc(item.display_name)}<br><span class="muted">${esc(item.donor_reference)}</span></td><td>${esc(item.unit_reference)}</td><td>${esc(domainLabel('component', item.component_type))}</td><td>${esc(item.blood_type)}</td><td>${esc(item.volume_ml || 0)} mL</td><td>${esc(fmtDate(item.collected_at))}</td></tr>`).join('') : `<tr><td colspan="6">${emptyState('droplet','reconcile.empty','reconcile.emptyHelp')}</td></tr>`}</tbody></table></div></article>` : `<article class="card">${emptyState('calendar','organizer.noDrives','organizer.noDrivesHelp')}</article>`}`;
}

function renderHospital() {
  if (state.view === 'clinical') return hospitalClinical();
  if (state.view === 'inventory') return hospitalInventory();
  if (state.view === 'components') return hospitalComponents();
  if (state.view === 'requests') return hospitalRequests();
  return hospitalOverview();
}

function hospitalOverview() {
  const profile = state.hospitalProfile;
  let notice = '';
  if (profile?.status === 'PENDING') notice = `<div class="config-warning">${icon('alert','icon-sm')} ${esc(tr('hospital.pendingNotice'))} <strong>${esc(tr('hospital.pendingHelp'))}</strong></div><div class="evidence-row"><span>${icon('file','icon-sm')} ${state.hospitalDocuments.length} ${esc(tr('hospital.documentsStored'))}</span>${profile.status === 'PENDING' ? `<button class="btn btn-secondary btn-sm" data-action="upload-hospital-evidence" data-hospital-id="${profile.id}">${esc(tr('hospital.addEvidence'))}</button>` : ''}</div>`;
  if (profile?.status === 'REJECTED') notice = `<div class="config-warning">${icon('alert','icon-sm')} ${esc(tr('hospital.rejectedNotice'))}${profile.rejection_reason ? ` <strong>${esc(profile.rejection_reason)}</strong>` : ''}</div><button class="btn btn-primary" data-action="apply-hospital">${esc(tr('hospital.resubmit'))}</button>`;
  if (profile?.status === 'VERIFIED') notice = `<div class="config-note">${icon('shield','icon-sm')} ${esc(tr('hospital.verifiedNotice'))}</div>`;
  return `${pageHeader('hospital.overviewTitle','hospital.overviewSubtitle',profile ? button('refresh-hospital','common.refresh','refresh','btn-secondary') : button('apply-hospital','hospital.apply','hospital'))}${profile ? `<section class="card card-pad"><div class="drive-title-row"><div><span class="section-label">${esc(tr('hospital.facility'))}</span><h2>${esc(profile.facility_name)}</h2><p>${esc(profile.address)} · ${esc(profile.city)}, ${esc(profile.state)}</p></div>${statusBadge(profile.status)}</div>${notice}</section>` : `<section class="card">${emptyState('hospital','hospital.noApplication','hospital.noApplicationHelp',button('apply-hospital','hospital.apply','plus'))}</section>`}<div class="grid grid-3" style="margin-top:18px">${metric('shield',String(state.clinicalQueue.filter(item => item.review_status === 'PENDING').length),'hospital.pendingReviews')}${metric('inventory',String(state.components.filter(item => ['AVAILABLE','RESERVED'].includes(item.status)).length),'hospital.inventoryUnits')}${metric('file',String(state.hospitalRequests.filter(item => ['PENDING','VERIFIED'].includes(item.status)).length),'hospital.activeRequests')}</div>`;
}

function hospitalClinical() {
  return `${pageHeader('clinical.title','clinical.subtitle',button('refresh-clinical','common.refresh','refresh','btn-secondary'))}<div class="stack">${state.clinicalQueue.length ? state.clinicalQueue.map(item => `<article class="card clinical-review-card"><div><div class="drive-title-row"><h2>${esc(tr('common.donor'))} · ${esc(item.donor_reference)}</h2>${statusBadge(item.review_status)}</div><p>${esc(tr('common.bloodGroup'))}: ${esc(item.blood_type)} · ${esc(tr('common.city'))}: ${esc(item.city || tr('common.none'))}</p><p>${esc(tr('clinical.precheckOutcome'))}: ${esc(statusLabel(item.outcome))}</p><div class="flag-list">${(item.flags || []).map(flag => `<span class="badge badge-amber">${esc(statusLabel(flag))}</span>`).join('') || `<span class="badge badge-green">${esc(tr('clinical.noFlags'))}</span>`}</div>${item.screening ? precheckSummaryMarkup(item.screening) : ''}${item.eligible_on ? `<div class="config-warning">${icon('calendar','icon-sm')} ${esc(tr('screening.earliestReview'))}: ${esc(item.eligible_on)} · ${esc((item.deferral_reason_codes || []).map(code => statusLabel(code)).join(', '))}</div>` : ''}<small>${esc(tr('common.expires'))}: ${esc(fmtDate(item.valid_until))}</small></div>${item.review_status === 'PENDING' ? `<div class="drive-actions"><button class="btn btn-primary" data-action="review-screening" data-screening-id="${item.screening_id}" data-decision="APPROVED">${esc(tr('clinical.approveQr'))}</button><button class="btn btn-secondary" data-action="review-screening" data-screening-id="${item.screening_id}" data-decision="DECLINED">${esc(tr('common.decline'))}</button></div>` : ''}</article>`).join('') : emptyState('shield','clinical.empty','clinical.emptyHelp')}</div>`;
}

function hospitalInventory() {
  const verified = state.hospitalProfile?.status === 'VERIFIED';
  if (!verified) return `${pageHeader('inventory.title','inventory.subtitle')}<article class="card">${emptyState('lock','hospital.verificationRequired','hospital.verificationRequiredHelp')}</article>`;
  const grouped = new Map();
  for (const component of state.components.filter(item => ['AVAILABLE','RESERVED'].includes(item.status))) {
    const key=`${component.blood_type}|${component.component_type}`;
    const row=grouped.get(key) || {blood_type:component.blood_type,component_type:component.component_type,available:0,reserved:0,expiring:0};
    row[component.status === 'RESERVED' ? 'reserved' : 'available'] += 1;
    if (['EXPIRED','EXPIRES_WITHIN_24_HOURS','EXPIRES_SOON'].includes(component.expiry_state)) row.expiring += 1;
    grouped.set(key,row);
  }
  const precise=[...grouped.values()];
  return `${pageHeader('inventory.title','inventory.subtitle',button('receive-component','components.receive','scan') + button('inventory-event','inventory.record','plus','btn-secondary'))}<div class="config-note">${icon('shield','icon-sm')} ${esc(tr('inventory.perUnitNotice'))}</div><div class="inventory-grid" style="margin-top:16px">${precise.length ? precise.map(item => `<article class="blood-stock"><div class="blood-stock-top"><span class="blood-stock-type">${esc(item.blood_type)}</span><span class="blood-stock-units">${item.available} ${esc(tr('common.units'))}</span></div><div class="progress ${item.expiring ? 'rose' : ''}"><span style="width:${Math.min(100,(item.available / Math.max(item.available+item.reserved,1))*100)}%"></span></div><small>${esc(domainLabel('component',item.component_type))} · ${item.reserved} ${esc(statusLabel('RESERVED'))} · ${item.expiring} ${esc(tr('components.soon'))}</small></article>`).join('') : emptyState('inventory','inventory.empty','inventory.emptyHelp',button('receive-component','components.receive','scan'))}</div><section style="margin-top:22px">${cardHeader('inventory.aggregateLedger','inventory.aggregateLedgerHelp')}<div class="card-body"><p class="muted">${esc(tr('inventory.aggregateLedgerNotice'))}</p>${state.inventory.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>${esc(tr('common.bloodGroup'))}</th><th>${esc(tr('common.component'))}</th><th>${esc(tr('common.units'))}</th></tr></thead><tbody>${state.inventory.map(item => `<tr><td>${esc(item.blood_type)}</td><td>${esc(domainLabel('component',item.component_type))}</td><td>${item.units_available-item.units_reserved}</td></tr>`).join('')}</tbody></table></div>` : ''}</div></section>`;
}

function hospitalComponents() {
  const verified = state.hospitalProfile?.status === 'VERIFIED';
  if (!verified) return `${pageHeader('components.title','components.subtitle')}<article class="card">${emptyState('lock','hospital.verificationRequired','hospital.verificationRequiredHelp')}</article>`;
  const expiry = state.componentExpiry || {};
  return `${pageHeader('components.title','components.subtitle',button('receive-component','components.receive','scan') + button('component-policies','components.policies','settings','btn-secondary'))}
    <div class="grid grid-4 metric-grid-mobile expiry-metrics">${metric('alert',String(expiry.EXPIRED || 0),'components.expired')}${metric('calendar',String(expiry.EXPIRES_WITHIN_24_HOURS || 0),'components.critical')}${metric('activity',String(expiry.EXPIRES_SOON || 0),'components.soon')}${metric('shield',String(expiry.WITHIN_POLICY_WINDOW || 0),'components.withinPolicy')}</div>
    <div class="config-note" style="margin-top:18px">${icon('shield','icon-sm')} ${esc(tr('components.policyNotice'))}</div>
    <article class="card" style="margin-top:18px"><div class="table-wrap"><table class="data-table"><thead><tr><th>${esc(tr('common.reference'))}</th><th>${esc(tr('common.component'))}</th><th>${esc(tr('common.bloodGroup'))}</th><th>${esc(tr('common.expires'))}</th><th>${esc(tr('common.status'))}</th><th>${esc(tr('common.actions'))}</th></tr></thead><tbody>${state.components.length ? state.components.map(item => `<tr class="expiry-${esc(item.expiry_state.toLowerCase())}"><td><strong>${esc(item.component_reference)}</strong>${item.isbt128_code ? `<br><small>${esc(tr('components.isbtExisting'))}: ${esc(item.isbt128_code)}</small>` : ''}</td><td>${esc(domainLabel('component',item.component_type))}</td><td>${esc(item.blood_type)}</td><td>${esc(fmtDate(item.expires_at))}<br><small>${esc(statusLabel(item.expiry_state))}</small></td><td>${statusBadge(item.status)}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-action="component-event" data-component-id="${item.id}">${esc(tr('components.recordEvent'))}</button><button class="btn btn-secondary btn-sm" data-action="component-history" data-component-id="${item.id}">${esc(tr('components.history'))}</button>${['COLLECTED','AVAILABLE','QUARANTINED'].includes(item.status) ? `<button class="btn btn-secondary btn-sm" data-action="split-component" data-component-id="${item.id}">${esc(tr('components.separate'))}</button><button class="btn btn-secondary btn-sm" data-action="handover-component" data-component-id="${item.id}">${esc(tr('components.handover'))}</button>` : ''}</div></td></tr>`).join('') : `<tr><td colspan="6">${emptyState('droplet','components.empty','components.emptyHelp',button('receive-component','components.receive','scan'))}</td></tr>`}</tbody></table></div></article>
    <section style="margin-top:22px">${cardHeader('components.handovers','components.handoversHelp')}<div class="stack">${state.handovers.length ? state.handovers.map(item => `<article class="card compact-card"><div><strong>${esc(item.container_reference)}</strong><p>${esc(fmtDate(item.handed_over_at))} · ${esc(item.dispatch_temperature_c)} °C</p></div><div class="drive-actions">${statusBadge(item.status)}${item.can_receive ? `<button class="btn btn-primary btn-sm" data-action="receive-handover" data-handover-id="${item.id}">${esc(tr('components.confirmReceipt'))}</button>` : ''}</div></article>`).join('') : emptyState('inventory','components.noHandovers','components.noHandoversHelp')}</div></section>`;
}

function hospitalRequests() {
  const verified = state.hospitalProfile?.status === 'VERIFIED';
  const cards = state.hospitalRequests.map(item => {
    const rare = item.urgency === 'RARE_STANDBY' && item.status === 'VERIFIED';
    const history = state.rareDispatchHistory[item.id];
    const summary = history?.summary;
    const rarePanel = rare ? `<section class="rare-dispatch-panel"><div class="drive-title-row"><div><strong>${esc(tr('rare.responseHistory'))}</strong>${summary ? `<p>${esc(tr('rare.contacted'))}: ${summary.contacted} · ${esc(tr('status.accepted'))}: ${summary.accepted} · ${esc(tr('status.declined'))}: ${summary.declined} · ${esc(tr('status.expired'))}: ${summary.expired}</p>` : `<p>${esc(tr('rare.notStarted'))}</p>`}</div><div class="drive-actions">${history?.can_expand ? `<button class="btn btn-secondary btn-sm" data-action="expand-rare-dispatch" data-request-id="${item.id}">${esc(tr('rare.expandCohort'))}</button>` : ''}${history?.can_start ?? true ? `<button class="btn btn-primary btn-sm" data-action="start-rare-dispatch" data-request-id="${item.id}">${esc(tr('rare.startMatching'))}</button>` : ''}</div></div>${history?.alerts?.length ? `<div class="rare-response-list">${history.alerts.map(alert => `<span><strong>${esc(alert.donor_reference)}</strong>${statusBadge(alert.response)}<small>${esc(tr('rare.tier'))} ${alert.tier} · ${esc(fmtDate(alert.responded_at || alert.response_deadline))}</small></span>`).join('')}</div>` : ''}<small>${esc(tr('rare.facilityPrivacy'))}</small></section>` : '';
    return `<article class="card request-card"><div class="request-type">${esc(item.blood_type)}</div><div><h2>${esc(domainLabel('component', item.component_type))} · ${item.units_needed} ${esc(tr('common.units'))}</h2><p>${esc(domainLabel('urgency', item.urgency))} · ${esc(fmtDate(item.expires_at))}</p><p><span class="badge ${item.ocr_status === 'OCR_MATCHED_REVIEW_REQUIRED' ? 'badge-green' : 'badge-amber'}">${esc(statusLabel(item.ocr_status))}</span> <small>${esc(tr('requests.ocrNotAuthenticity'))}</small></p></div><div class="drive-actions">${statusBadge(item.status)}${item.status === 'PENDING' ? `<button class="btn btn-primary btn-sm" data-action="review-request" data-request-id="${item.id}">${esc(tr('requests.reviewDocument'))}</button>` : ''}</div>${rarePanel}</article>`;
  }).join('');
  return `${pageHeader('requests.title','requests.subtitle',verified ? button('new-request','requests.create','plus') : '')}${verified ? `<div class="stack">${cards || emptyState('file','requests.empty','requests.emptyHelp',button('new-request','requests.create','plus'))}</div>` : `<article class="card">${emptyState('lock','hospital.verificationRequired','hospital.verificationRequiredHelp')}</article>`}`;
}

function renderVenue() {
  if (state.view === 'impact') return venueImpact();
  return venueProposals();
}

function venueProposals() {
  return `${pageHeader('venue.proposalsTitle','venue.proposalsSubtitle',button('refresh-proposals','common.refresh','refresh','btn-secondary'))}<div class="stack">${state.proposals.length ? state.proposals.map(item => `<article class="card drive-card"><div class="drive-main"><div class="drive-title-row"><h2>${esc(item.proposed_name)}</h2>${statusBadge(item.status)}</div><p>${esc(item.venue_name)} · ${esc(item.address)}</p><p>${esc(fmtDate(item.starts_at))}</p><span class="badge badge-neutral">${esc(tr('common.target'))}: ${item.target_units}</span></div>${['PENDING','CHANGES_REQUESTED'].includes(item.status) ? `<div class="drive-actions"><button class="btn btn-primary btn-sm" data-action="proposal-decision" data-proposal-id="${item.id}" data-decision="APPROVED">${esc(tr('common.approve'))}</button><button class="btn btn-secondary btn-sm" data-action="proposal-decision" data-proposal-id="${item.id}" data-decision="CHANGES_REQUESTED">${esc(tr('venue.requestChanges'))}</button><button class="btn btn-secondary btn-sm" data-action="proposal-decision" data-proposal-id="${item.id}" data-decision="REJECTED">${esc(tr('common.reject'))}</button></div>` : ''}</article>`).join('') : emptyState('mail','venue.noProposals','venue.noProposalsHelp')}</div>`;
}

function venueImpact() {
  const totals=state.hostImpact.reduce((sum,item)=>({registrations:sum.registrations+item.registrations,checkins:sum.checkins+item.checkins,units:sum.units+item.units_logged}),{registrations:0,checkins:0,units:0});
  return `${pageHeader('venue.impactTitle','venue.impactSubtitle')}<div class="grid grid-4 metric-grid-mobile">${metric('calendar',String(state.hostImpact.length),'venue.approvedDrives')}${metric('users',String(totals.registrations),'organizer.registrations')}${metric('scan',String(totals.checkins),'organizer.checkins')}${metric('droplet',String(totals.units),'organizer.unitsLogged')}</div><div class="stack" style="margin-top:18px">${state.hostImpact.length ? state.hostImpact.map(item=>`<article class="card compact-card"><div><strong>${esc(item.drive_name)}</strong><p>${esc(item.venue_name)} · ${esc(fmtDate(item.starts_at))}</p><small>${esc(tr('organizer.registrations'))}: ${item.registrations} · ${esc(tr('organizer.checkins'))}: ${item.checkins} · ${esc(tr('organizer.unitsLogged'))}: ${item.units_logged}</small></div></article>`).join('') : emptyState('chart','venue.noImpact','venue.noImpactHelp')}</div><article class="card" style="margin-top:18px"><div class="card-body"><p class="muted">${esc(tr('venue.impactPrivacy'))}</p></div></article>`;
}

function renderAdmin() {
  if (state.view === 'users') return adminUsers();
  if (state.view === 'invitations') return adminInvitations();
  if (state.view === 'hospitals') return adminHospitals();
  if (state.view === 'drives') return adminDrives();
  if (state.view === 'data') return adminData();
  if (state.view === 'privacy') return adminPrivacy();
  if (state.view === 'audit') return adminAudit();
  return adminOverview();
}

function adminOverview() {
  const data = state.adminOverview || {};
  return `${pageHeader('admin.overviewTitle','admin.overviewSubtitle',button('refresh-admin','common.refresh','refresh','btn-secondary'))}<div class="grid grid-4 metric-grid-mobile">${metric('users',String(data.users || 0),'admin.users')}${metric('hospital',String(data.pending_hospitals || 0),'admin.pendingHospitals')}${metric('calendar',String(data.open_drives || 0),'admin.openDrives')}${metric('droplet',String(data.donations || 0),'admin.donations')}</div><div class="grid grid-3" style="margin-top:18px">${metric('mail',String(data.pending_invitations || 0),'admin.pendingInvites')}${metric('link',String(data.campaigns || 0),'admin.campaigns')}${metric('file',String(data.blood_requests || 0),'admin.requests')}</div>`;
}

function adminUsers() {
  return `${pageHeader('admin.usersTitle','admin.usersSubtitle',button('refresh-admin','common.refresh','refresh','btn-secondary'))}<article class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>${esc(tr('common.email'))}</th><th>${esc(tr('common.roles'))}</th><th>${esc(tr('common.status'))}</th><th>${esc(tr('common.actions'))}</th></tr></thead><tbody>${state.adminUsers.map(user => `<tr><td>${esc(user.email)}</td><td>${user.roles.map(role => `<span class="badge badge-neutral">${esc(roleLabel(role))}</span>`).join(' ')}</td><td>${statusBadge(user.active ? 'ACTIVE' : 'DISABLED')}</td><td><button class="btn btn-secondary btn-sm" data-action="edit-roles" data-user-id="${user.id}">${esc(tr('admin.editRoles'))}</button><button class="btn btn-secondary btn-sm" data-action="toggle-user" data-user-id="${user.id}" data-active="${!user.active}">${esc(tr(user.active ? 'admin.disable' : 'admin.enable'))}</button></td></tr>`).join('')}</tbody></table></div></article>`;
}

function adminInvitations() {
  return `${pageHeader('admin.invitationsTitle','admin.invitationsSubtitle',button('invite-user','admin.invite','plus'))}<article class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>${esc(tr('common.email'))}</th><th>${esc(tr('common.roles'))}</th><th>${esc(tr('common.status'))}</th><th>${esc(tr('admin.delivery'))}</th><th>${esc(tr('common.expires'))}</th><th>${esc(tr('common.actions'))}</th></tr></thead><tbody>${state.invitations.length ? state.invitations.map(item => `<tr><td>${esc(item.email)}</td><td>${esc(item.roles.map(roleLabel).join(', '))}</td><td>${statusBadge(item.status)}</td><td>${statusBadge(item.delivery_status || 'NOT_SENT')}<br><small class="muted">${esc(item.last_delivery_at ? fmtDate(item.last_delivery_at) : tr('common.notSent'))}</small></td><td>${esc(fmtDate(item.expires_at))}</td><td>${item.status === 'PENDING' ? `<button class="btn btn-secondary btn-sm" data-action="resend-invitation" data-invitation-id="${item.id}">${esc(tr('admin.resend'))}</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="6">${emptyState('mail','admin.noInvites','admin.noInvitesHelp')}</td></tr>`}</tbody></table></div></article>`;
}

function adminHospitals() {
  return `${pageHeader('admin.hospitalsTitle','admin.hospitalsSubtitle',button('refresh-admin','common.refresh','refresh','btn-secondary'))}<div class="stack">${state.hospitalApplications.length ? state.hospitalApplications.map(item => `<article class="card drive-card"><div class="drive-main"><div class="drive-title-row"><h2>${esc(item.facility_name)}</h2>${statusBadge(item.status)}</div><p>${esc(item.registration_number)} · ${esc(item.institutional_email)}</p><p>${esc(item.address)} · ${esc(item.city)}, ${esc(item.state)}</p></div><div class="drive-actions"><button class="btn btn-secondary btn-sm" data-action="review-hospital-documents" data-hospital-id="${item.id}">${esc(tr('hospital.reviewEvidence'))}</button><button class="btn btn-primary btn-sm" data-action="hospital-decision" data-hospital-id="${item.id}" data-decision="VERIFIED">${esc(tr('common.verify'))}</button><button class="btn btn-secondary btn-sm" data-action="hospital-decision" data-hospital-id="${item.id}" data-decision="REJECTED">${esc(tr('common.reject'))}</button></div></article>`).join('') : emptyState('hospital','admin.noHospitals','admin.noHospitalsHelp')}</div>`;
}

function adminDrives() {
  const drives = state.adminData?.drives?.length ? state.adminData.drives : state.drives;
  return `${pageHeader('admin.drivesTitle','admin.drivesSubtitle',button('refresh-admin','common.refresh','refresh','btn-secondary'))}<div class="stack">${drives.length ? drives.map(item => `<article class="card drive-card"><div class="drive-main"><div class="drive-title-row"><h2>${esc(item.name)}</h2>${statusBadge(item.status)}</div><p>${esc(item.venue_name || item.address)} · ${esc(fmtDate(item.starts_at))}</p><span class="badge badge-neutral">${esc(tr('common.target'))}: ${item.target_units}</span></div><div class="drive-actions">${item.status === 'PLANNED' ? `<button class="btn btn-primary btn-sm" data-action="drive-status" data-drive-id="${item.id}" data-status="APPROVED">${esc(tr('common.approve'))}</button>` : ''}${!['COMPLETED','CANCELLED'].includes(item.status) ? `<button class="btn btn-secondary btn-sm" data-action="drive-status" data-drive-id="${item.id}" data-status="CANCELLED">${esc(tr('common.cancel'))}</button>` : ''}</div></article>`).join('') : emptyState('calendar','organizer.noDrives','organizer.noDrivesHelp')}</div>`;
}

function adminData() {
  const data = state.adminData || { donors:[],drives:[],hospitals:[],campaigns:[],registrations:[],donations:[],requests:[] };
  const table = (titleKey, headers, rows, colspan) => `<article class="card">${cardHeader(titleKey,'admin.safeDataNote')}<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(key => `<th>${esc(tr(key))}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${colspan}">${emptyState('file','admin.noOperationalData','admin.noOperationalDataHelp')}</td></tr>`}</tbody></table></div></article>`;
  return `${pageHeader('admin.dataTitle','admin.dataSubtitle',button('refresh-admin','common.refresh','refresh','btn-secondary'))}
    <div class="grid grid-4">${metric('user',String(data.donors.length),'admin.donors')}${metric('calendar',String(data.drives.length),'admin.drives')}${metric('users',String(data.registrations.length),'admin.registrations')}${metric('droplet',String(data.donations.length),'admin.donations')}</div>
    <div class="admin-data-stack">
      ${table('admin.recentDonors',['common.reference','common.name','common.bloodGroup','common.city','common.status'],data.donors.slice(0,100).map(item => `<tr><td>${esc(item.reference_code)}</td><td>${esc(item.display_name)}</td><td>${esc(item.blood_type)}</td><td>${esc(item.city || '')}</td><td>${statusBadge(item.profile_status)}</td></tr>`).join(''),5)}
      ${table('admin.campaigns',['campaign.campaignTitle','campaign.slug','common.status','common.date'],data.campaigns.slice(0,100).map(item => `<tr><td>${esc(item.title)}</td><td>${esc(item.slug)}</td><td>${statusBadge(item.status)}</td><td>${esc(fmtDate(item.created_at))}</td></tr>`).join(''),4)}
      ${table('admin.drives',['common.driveName','common.venue','common.starts','common.target','common.status'],data.drives.slice(0,100).map(item => `<tr><td>${esc(item.name)}</td><td>${esc(item.venue_name || item.address || '')}</td><td>${esc(fmtDate(item.starts_at))}</td><td>${esc(item.target_units)}</td><td>${statusBadge(item.status)}</td></tr>`).join(''),5)}
      ${table('admin.registrations',['common.reference','common.drive','common.status','common.date'],data.registrations.slice(0,100).map(item => `<tr><td>${esc(item.id)}</td><td>${esc(item.drive_id)}</td><td>${statusBadge(item.status)}</td><td>${esc(fmtDate(item.registered_at))}</td></tr>`).join(''),4)}
      ${table('admin.donations',['common.unitReference','common.drive','common.bloodGroup','common.component','common.date'],data.donations.slice(0,100).map(item => `<tr><td>${esc(item.unit_reference)}</td><td>${esc(item.drive_id)}</td><td>${esc(item.blood_type)}</td><td>${esc(domainLabel('component',item.component_type))}</td><td>${esc(fmtDate(item.collected_at))}</td></tr>`).join(''),5)}
      ${table('admin.requests',['common.reference','common.bloodGroup','common.component','requests.urgency','common.status'],data.requests.slice(0,100).map(item => `<tr><td>${esc(item.id)}</td><td>${esc(item.blood_type)}</td><td>${esc(domainLabel('component',item.component_type))}</td><td>${esc(domainLabel('urgency',item.urgency))}</td><td>${statusBadge(item.status)}</td></tr>`).join(''),5)}
    </div>`;
}

function adminPrivacy() {
  return `${pageHeader('privacy.adminTitle','privacy.adminSubtitle',button('refresh-admin','common.refresh','refresh','btn-secondary'))}<div class="stack">${state.adminPrivacyRequests.length ? state.adminPrivacyRequests.map(item => `<article class="card card-pad"><div class="drive-title-row"><div><span class="section-label">${esc(domainLabel('privacyRequest',item.request_type))}</span><h2>${esc(item.user_email || item.user_id)}</h2><p>${esc(item.details || '')}</p><small>${esc(tr('privacy.targetDate'))}: ${esc(fmtDate(item.due_at))}</small></div>${statusBadge(item.status)}</div>${['SUBMITTED','IN_REVIEW'].includes(item.status) ? `<div class="drive-actions"><button class="btn btn-secondary btn-sm" data-action="privacy-decision" data-request-id="${item.id}" data-status="IN_REVIEW">${esc(tr('privacy.inReview'))}</button><button class="btn btn-primary btn-sm" data-action="privacy-decision" data-request-id="${item.id}" data-status="COMPLETED">${esc(tr('common.confirm'))}</button><button class="btn btn-secondary btn-sm" data-action="privacy-decision" data-request-id="${item.id}" data-status="REJECTED">${esc(tr('common.reject'))}</button></div>` : ''}</article>`).join('') : emptyState('lock','privacy.empty','privacy.emptyHelp')}</div>`;
}

function adminAudit() {
  return `${pageHeader('admin.auditTitle','admin.auditSubtitle',button('refresh-admin','common.refresh','refresh','btn-secondary'))}<article class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>${esc(tr('common.date'))}</th><th>${esc(tr('admin.event'))}</th><th>${esc(tr('admin.resource'))}</th><th>${esc(tr('common.reference'))}</th></tr></thead><tbody>${state.audit.length ? state.audit.map(item => `<tr><td>${esc(fmtDate(item.occurred_at))}</td><td>${esc(domainLabel('auditAction', item.action))}</td><td>${esc(domainLabel('resource', item.resource_type))}</td><td>${esc(item.resource_id || '')}</td></tr>`).join('') : `<tr><td colspan="4">${emptyState('activity','admin.noAudit','admin.noAuditHelp')}</td></tr>`}</tbody></table></div></article>`;
}

function render() {
  document.body.classList.toggle('landing-mode', state.screen === 'landing');
  if (state.screen === 'loading') app.innerHTML = renderLoading();
  else if (state.screen === 'app') app.innerHTML = renderApp();
  else app.innerHTML = renderLanding();
  queueMicrotask(hydrateMapplsMaps);
}

function authModal(mode = 'signin', initialEmail = '') {
  const register = mode === 'register';
  const reset = mode === 'reset';
  const email = esc(initialEmail);
  const form = register ? `<form id="auth-register-form" class="auth-form"><div class="field"><label>Email address</label><input class="input" name="email" type="email" autocomplete="email" value="${email}" required autofocus></div><div class="field"><label>Create password</label><input class="input" name="password" type="password" autocomplete="new-password" minlength="8" required><span class="field-hint">Use at least 8 characters and a unique password.</span></div><div class="field"><label>Confirm password</label><input class="input" name="confirm_password" type="password" autocomplete="new-password" minlength="8" required></div><button class="btn btn-primary btn-lg auth-submit" type="submit">Create verified account</button></form>` : reset ? `<form id="auth-reset-form" class="auth-form"><div class="field"><label>Email address</label><input class="input" name="email" type="email" autocomplete="email" value="${email}" required autofocus></div><button class="btn btn-primary btn-lg auth-submit" type="submit">Send password reset email</button></form>` : `<form id="auth-signin-form" class="auth-form"><div class="field"><label>Email address</label><input class="input" name="email" type="email" autocomplete="email" value="${email}" required autofocus></div><div class="field"><div class="field-label-row"><label>Password</label><button class="auth-text-button" type="button" data-action="show-reset">Forgot password?</button></div><input class="input" name="password" type="password" autocomplete="current-password" required></div><button class="btn btn-primary btn-lg auth-submit" type="submit">Sign in securely</button></form>`;
  openModal({
    title: register ? 'Create your RaktFlow account' : reset ? 'Reset your password' : 'Secure sign in',
    subtitle: register ? 'New uninvited accounts receive only Donor access' : reset ? 'Firebase will send a protected reset message' : 'Use your verified account or staff invitation email',
    body: `<div class="auth-panel"><div class="auth-icon">${icon(register ? 'heart' : reset ? 'mail' : 'lock','icon-lg')}</div><h3>${register ? 'Join the verified donor network.' : reset ? 'Recover access securely.' : 'Welcome back.'}</h3><p>${register ? 'Verify your email once, then complete your private donor profile.' : reset ? 'For privacy, the confirmation does not reveal whether an account exists.' : 'Your roles are assigned by the server, never by this form.'}</p>${form}${!isAuthConfigured() ? `<div class="config-warning">${icon('alert','icon-sm')} Firebase web variables are not configured.</div>` : ''}${!reset ? `<div class="auth-divider"><span>or</span></div><button class="btn btn-secondary btn-lg" type="button" style="width:100%" data-action="google-signin">Continue with Google</button>` : ''}<div class="auth-switch">${register ? 'Already have an account? <button type="button" data-action="show-signin">Sign in</button>' : reset ? 'Remembered it? <button type="button" data-action="show-signin">Return to sign in</button>' : 'New to RaktFlow? <button type="button" data-action="show-register">Create an account</button>'}</div><p class="auth-legal">Online registration and screening are not medical clearance.</p></div>`
  });
}

function accountModal() {
  const roles = state.account?.roles || [];
  openModal({
    title: tr('account.title'),
    subtitle: state.account?.email || '',
    body: `<div class="account-sheet"><span class="account-avatar">${esc((state.profile?.full_name || state.account?.email || 'RF').slice(0,2).toUpperCase())}</span><h3>${esc(state.profile?.full_name || state.account?.email || '')}</h3><p>${esc(tr('account.serverRoles'))}</p><div class="flag-list">${roles.map(role => `<span class="badge badge-neutral">${esc(roleLabel(role))}</span>`).join('')}</div>${roles.includes('ROLE_DONOR') ? `<button class="btn btn-primary" data-action="open-profile">${icon('user','icon-sm')} ${esc(tr(state.profile ? 'common.editProfile' : 'common.completeProfile'))}</button>` : ''}${!state.hospitalProfile ? `<button class="btn btn-secondary" data-action="apply-hospital">${icon('hospital','icon-sm')} ${esc(tr('hospital.apply'))}</button>` : `<div class="account-application"><strong>${esc(state.hospitalProfile.facility_name)}</strong>${statusBadge(state.hospitalProfile.status)}<small>${state.hospitalDocuments.length} ${esc(tr('hospital.documentsStored'))}</small></div>${state.hospitalProfile.status === 'PENDING' ? `<button class="btn btn-secondary" data-action="upload-hospital-evidence" data-hospital-id="${state.hospitalProfile.id}">${icon('file','icon-sm')} ${esc(tr('hospital.addEvidence'))}</button>` : ''}`}<button class="btn btn-secondary" data-action="sign-out">${esc(tr('common.signOut'))}</button></div>`
  });
}

function profileModal() {
  const profile = state.profile || {};
  openModal({
    title: tr(profile.reference_code ? 'common.editProfile' : 'common.completeProfile'),
    subtitle: tr('profile.subtitle'),
    wide: true,
    body: `<form id="profile-form" class="form-grid"><div class="field"><label>${esc(tr('common.name'))}</label><input class="input" name="full_name" value="${esc(profile.full_name || '')}" autocomplete="name" required minlength="2" autofocus></div><div class="field"><label>${esc(tr('profile.birthDate'))}</label><input class="input" name="date_of_birth" type="date" value="${esc(profile.date_of_birth || '')}" required></div><div class="field"><label>${esc(tr('common.phone'))}</label><input class="input" name="phone" type="tel" autocomplete="tel" value="${esc(profile.phone || '')}" placeholder="+91 99000 00000" required></div><div class="field"><label>${esc(tr('common.city'))}</label><input class="input" name="city" value="${esc(profile.city || '')}" required></div><div class="field"><label>${esc(tr('common.bloodGroup'))}</label><select class="select" name="blood_type" required>${['UNKNOWN','A+','A-','B+','B-','AB+','AB-','O+','O-','BOMBAY'].map(value => `<option value="${value}" ${profile.blood_type === value ? 'selected' : ''}>${value === 'UNKNOWN' ? esc(tr('profile.unknownBlood')) : value}</option>`).join('')}</select><span class="field-hint">${esc(tr('profile.bloodNotice'))}</span></div><input name="latitude" type="hidden" value="${esc(profile.latitude ?? '')}"><input name="longitude" type="hidden" value="${esc(profile.longitude ?? '')}"><div class="field full location-control approximate-location-control"><button class="btn btn-secondary" type="button" data-action="fill-profile-location">${icon('pin','icon-sm')} ${esc(tr('common.useLocation'))}</button><span id="profile-location-status" class="field-hint">${esc(profile.latitude != null ? tr('profile.approximateLocationSaved') : tr('profile.locationNotice'))}</span><small>${esc(tr('profile.locationMinimization'))}</small></div><label class="field full consent-row"><input type="checkbox" name="consent_to_process" required><span><strong>${esc(tr('profile.consent'))}</strong><small>${esc(tr('profile.consentHelp'))}</small></span></label></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-profile">${esc(tr('common.save'))}</button>`
  });
}

function screeningModal() {
  const question = (name, labelKey, _safeYes = false, optional = false) => `<fieldset class="screening-question screening-tap-question"><legend><strong>${esc(tr(labelKey))}</strong></legend><div class="binary-choice"><label><input type="radio" name="${name}" value="true" required><span>${esc(tr('common.yes'))}</span></label><label><input type="radio" name="${name}" value="false" required><span>${esc(tr('common.no'))}</span></label>${optional ? `<label><input type="radio" name="${name}" value="null" required><span>${esc(tr('common.notApplicable'))}</span></label>` : ''}</div></fieldset>`;
  const dateField = (name, labelKey, dependsOn) => `<div class="field" data-date-for="${dependsOn}"><label>${esc(tr(labelKey))}</label><input class="input" name="${name}" type="date" data-required-when="${dependsOn}"><span class="field-hint">${esc(tr('screening.dateIfYes'))}</span></div>`;
  openModal({
    title: tr('screening.title'),
    subtitle: `${tr('screening.subtitle')} · ${BUILD_TAG}`,
    wide: true,
    body: `<form id="screening-form" class="screening-form" novalidate><div class="screening-notice">${icon('shield')}<span><strong>${esc(tr('screening.noticeTitle'))}</strong><small>${esc(tr('screening.noticeBody'))}</small></span></div><section><div class="form-grid"><div class="field"><label>${esc(tr('screening.weight'))}</label><input class="input" name="weight_kg" type="number" min="25" max="250" step="0.1" required><span class="field-hint">${esc(tr('screening.weightHint'))}</span></div><div class="field"><label>${esc(tr('screening.lastDonation'))}</label><input class="input" name="last_donation_date" type="date"><span class="field-hint">${esc(tr('screening.dateIfYes'))}</span></div>${dateField('antibiotics_completed_date','screening.antibioticsCompleted','fever_infection_or_antibiotics')}${dateField('surgery_or_transfusion_date','screening.surgeryDate','surgery_transfusion_or_hospitalization_last_12_months')}${dateField('tattoo_or_piercing_date','screening.tattooDate','tattoo_or_piercing_last_12_months')}${dateField('malaria_risk_return_date','screening.travelReturnDate','malaria_risk_travel_or_residence')}${dateField('delivery_or_pregnancy_end_date','screening.pregnancyEndDate','pregnancy_breastfeeding_or_recent_delivery')}</div></section><section><div class="question-list">${question('feeling_well_today','screening.feelingWell',true)}${question('fever_infection_or_antibiotics','screening.infection')}${question('medication_requires_review','screening.medication')}${question('heart_lung_kidney_liver_or_bleeding_condition','screening.conditions')}${question('surgery_transfusion_or_hospitalization_last_12_months','screening.procedure')}${question('tattoo_or_piercing_last_12_months','screening.tattoo')}${question('malaria_risk_travel_or_residence','screening.travel')}${question('pregnancy_breastfeeding_or_recent_delivery','screening.pregnancy',false,true)}${question('alcohol_within_24_hours','screening.alcohol24h')}${question('recent_immunization_14_days','screening.immunization14d')}</div></section><section class="attestation-block"><p class="muted">${esc(tr('screening.reviewAssignmentHelp'))}</p><label><input type="checkbox" name="answers_are_truthful" required><span><strong>${esc(tr('screening.truth'))}</strong></span></label><label><input type="checkbox" name="consent_to_clinical_review" required><span><strong>${esc(tr('screening.reviewConsent'))}</strong></span></label></section></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="submit-screening">${esc(tr('screening.submit'))}</button>`,
    onOpen: () => {
      const form = document.querySelector('#screening-form');
      form?.addEventListener('change', event => {
        const radio = event.target.closest('input[type="radio"][name]');
        if (!radio || !radio.checked) return;
        const dateInput = form.querySelector(`input[data-required-when="${radio.name}"]`);
        if (!dateInput) return;
        // Dates are never natively required — saveScreening validates them
        // with a clear message only when the linked answer is "Yes".
        if (radio.value !== 'true') dateInput.value = '';
      });
    }
  });
}


function driveModal() {
  const start = new Date(Date.now() + 86400000); start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
  const end = new Date(Date.now() + 86400000 + 6 * 3600000); end.setMinutes(end.getMinutes() - end.getTimezoneOffset());
  openModal({
    title: tr('organizer.createDrive'), subtitle: tr('organizer.createDriveHelp'), wide: true,
    body: `<form id="drive-form" class="form-grid"><div class="field full"><label>${esc(tr('common.driveName'))}</label><input class="input" name="name" required minlength="3" autofocus></div><div class="field"><label>${esc(tr('common.venue'))}</label><input class="input" name="venue_name" required></div><div class="field"><label>${esc(tr('common.target'))}</label><input class="input" name="target_units" type="number" min="1" max="1000" value="50" required></div><div class="field full"><label>${esc(tr('common.address'))}</label><textarea class="textarea" name="address" required></textarea></div><div class="field"><label>${esc(tr('common.latitude'))}</label><input class="input" name="latitude" type="number" step="any"><span class="field-hint">${esc(tr('organizer.coordinatesOptional'))}</span></div><div class="field"><label>${esc(tr('common.longitude'))}</label><input class="input" name="longitude" type="number" step="any"><span class="field-hint">${esc(tr('organizer.coordinatesOptional'))}</span></div><div class="field full"><button class="btn btn-secondary" type="button" data-action="fill-drive-location">${icon('pin','icon-sm')} ${esc(tr('common.useLocation'))}</button></div><div class="field"><label>${esc(tr('common.starts'))}</label><input class="input" name="starts_at" type="datetime-local" value="${start.toISOString().slice(0,16)}" required></div><div class="field"><label>${esc(tr('common.ends'))}</label><input class="input" name="ends_at" type="datetime-local" value="${end.toISOString().slice(0,16)}" required></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-drive">${esc(tr('organizer.createDrive'))}</button>`
  });
}

function quotaModal() {
  const drive = activeDrive();
  if (!drive) { toast(tr('error.title'), tr('intake.selectDrive'), 'warning'); return; }
  const current = Object.fromEntries(state.driveQuotas.map(item => [item.blood_type, item]));
  const recommendations = Object.fromEntries(state.quotaRecommendations.map(item => [item.blood_type, item]));
  const groups = ['A+','A-','B+','B-','AB+','AB-','O+','O-','BOMBAY'];
  openModal({
    title: tr('quota.title'), subtitle: tr('quota.subtitle'), wide: true,
    body: `<form id="quota-form" data-drive-id="${drive.id}"><div class="config-note">${icon('shield','icon-sm')} ${esc(tr('quota.advisory'))}</div><div class="quota-grid">${groups.map(group => {
      const item = current[group]; const suggestion = recommendations[group];
      const requests = state.verifiedNeeds.filter(request => request.blood_type === group);
      return `<article class="quota-row"><div class="quota-group">${esc(group)}</div><label class="field"><span>${esc(tr('quota.maximum'))}</span><input class="input" name="max_${group}" type="number" min="0" max="1000" value="${item?.max_registrations ?? suggestion?.suggested_max_registrations ?? 0}"></label><label class="field"><span>${esc(tr('quota.verifiedNeed'))}</span><select class="select" name="request_${group}"><option value="">${esc(tr('common.none'))}</option>${requests.map(request => `<option value="${request.id}" ${item?.source_request_id === request.id ? 'selected' : ''}>${esc(request.facility_name)} · ${request.units_needed} ${esc(tr('common.units'))}</option>`).join('')}</select></label><label class="field"><span>${esc(tr('common.note'))}</span><input class="input" name="reason_${group}" value="${esc(item?.rationale || '')}" placeholder="${esc(tr('quota.reasonPlaceholder'))}"></label><label class="quota-active"><input type="checkbox" name="active_${group}" ${item?.active ?? true ? 'checked' : ''}> ${esc(tr('common.active'))}</label><small>${esc(tr('quota.suggested'))}: ${suggestion?.suggested_max_registrations ?? 0} · ${esc(tr('quota.need'))}: ${suggestion?.verified_need_units ?? 0} · ${esc(tr('quota.available'))}: ${suggestion?.available_inventory_units ?? 0}</small></article>`;
    }).join('')}</div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-quotas">${esc(tr('common.save'))}</button>`
  });
}

function proposalModal() {
  const start = new Date(Date.now() + 7 * 86400000); start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
  const end = new Date(Date.now() + 7 * 86400000 + 6 * 3600000); end.setMinutes(end.getMinutes() - end.getTimezoneOffset());
  openModal({
    title: tr('organizer.proposeDrive'), subtitle: tr('organizer.proposeDriveHelp'), wide: true,
    body: `<form id="proposal-form" class="form-grid"><div class="field"><label>${esc(tr('venue.hostEmail'))}</label><input class="input" name="host_email" type="email" required autofocus></div><div class="field"><label>${esc(tr('common.driveName'))}</label><input class="input" name="proposed_name" required></div><div class="field"><label>${esc(tr('common.venue'))}</label><input class="input" name="venue_name" required></div><div class="field"><label>${esc(tr('common.target'))}</label><input class="input" name="target_units" type="number" min="1" max="1000" value="50" required></div><div class="field full"><label>${esc(tr('common.address'))}</label><textarea class="textarea" name="address" required></textarea></div><div class="field"><label>${esc(tr('common.latitude'))}</label><input class="input" name="latitude" type="number" step="any" required></div><div class="field"><label>${esc(tr('common.longitude'))}</label><input class="input" name="longitude" type="number" step="any" required></div><div class="field full"><button class="btn btn-secondary" type="button" data-action="fill-proposal-location">${icon('pin','icon-sm')} ${esc(tr('common.useLocation'))}</button></div><div class="field"><label>${esc(tr('common.starts'))}</label><input class="input" name="starts_at" type="datetime-local" value="${start.toISOString().slice(0,16)}" required></div><div class="field"><label>${esc(tr('common.ends'))}</label><input class="input" name="ends_at" type="datetime-local" value="${end.toISOString().slice(0,16)}" required></div><div class="field"><label>${esc(tr('venue.recoverySeats'))}</label><input class="input" name="recovery_seats" type="number" min="1" value="30"></div><fieldset class="field full option-grid"><label><input type="checkbox" name="power_available" checked> ${esc(tr('venue.power'))}</label><label><input type="checkbox" name="wifi_available" checked> ${esc(tr('venue.wifi'))}</label><label><input type="checkbox" name="parking_available" checked> ${esc(tr('venue.parking'))}</label><label><input type="checkbox" name="privacy_partitions" checked> ${esc(tr('venue.privacy'))}</label></fieldset></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-proposal">${esc(tr('common.send'))}</button>`
  });
}

function campaignModal(campaign = null) {
  if (!state.drives.length) { toast(tr('error.title'), tr('campaign.driveRequired'), 'warning'); return; }
  const poster = campaign?.poster || {};
  openModal({
    title: tr(campaign ? 'campaign.edit' : 'campaign.create'), subtitle: tr('campaign.formHelp'), wide: true,
    body: `<form id="campaign-form" data-campaign-id="${campaign?.id || ''}" class="form-grid"><div class="field"><label>${esc(tr('common.drive'))}</label><select class="select" name="drive_id" ${campaign ? 'disabled' : ''}>${state.drives.map(drive => `<option value="${drive.id}" ${campaign?.drive.id === drive.id ? 'selected' : ''}>${esc(drive.name)}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('campaign.slug'))}</label><input class="input" name="slug" value="${esc(campaign?.slug || '')}" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="community-drive-august" required></div><div class="field full"><label>${esc(tr('campaign.campaignTitle'))}</label><input class="input" name="title" value="${esc(campaign?.title || '')}" required></div><div class="field full"><label>${esc(tr('campaign.description'))}</label><textarea class="textarea" name="description">${esc(campaign?.description || '')}</textarea></div><div class="field"><label>${esc(tr('campaign.headline'))}</label><input class="input" name="headline" value="${esc(poster.headline || 'Donate blood. Give time.')}" required></div><div class="field"><label>${esc(tr('campaign.subheading'))}</label><input class="input" name="subheading" value="${esc(poster.subheading || 'Join a verified community blood drive.')}"></div><div class="field"><label>${esc(tr('campaign.organizerName'))}</label><input class="input" name="organizer_name" value="${esc(poster.organizer_name || 'RaktFlow community partner')}" required></div><div class="field"><label>${esc(tr('campaign.callToAction'))}</label><input class="input" name="call_to_action" value="${esc(poster.call_to_action || 'Register securely')}" required></div><div class="field"><label>${esc(tr('campaign.color'))}</label><input class="input color-input" name="accent_color" type="color" value="${esc(poster.accent_color || '#e11d48')}"></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-campaign">${esc(tr('common.save'))}</button>`
  });
}

function hospitalApplicationModal() {
  openModal({
    title: tr('hospital.apply'), subtitle: tr('hospital.applicationHelp'), wide: true,
    body: `<form id="hospital-form" class="form-grid"><div class="field"><label>${esc(tr('hospital.facilityName'))}</label><input class="input" name="facility_name" required autofocus></div><div class="field"><label>${esc(tr('hospital.registrationNumber'))}</label><input class="input" name="registration_number" required></div><div class="field"><label>${esc(tr('hospital.institutionalEmail'))}</label><input class="input" name="institutional_email" type="email" value="${esc(state.account?.email || '')}" required></div><div class="field"><label>${esc(tr('common.phone'))}</label><input class="input" name="phone" type="tel" required></div><div class="field full"><label>${esc(tr('common.address'))}</label><textarea class="textarea" name="address" required></textarea></div><div class="field"><label>${esc(tr('common.city'))}</label><input class="input" name="city" required></div><div class="field"><label>${esc(tr('common.state'))}</label><input class="input" name="state" value="Andhra Pradesh" required></div><div class="field"><label>${esc(tr('common.latitude'))}</label><input class="input" name="latitude" type="number" step="any" required></div><div class="field"><label>${esc(tr('common.longitude'))}</label><input class="input" name="longitude" type="number" step="any" required></div><div class="field full"><label>${esc(tr('hospital.evidence'))}</label><input class="input" name="evidence" type="file" accept="application/pdf,image/jpeg,image/png" required><span class="field-hint">${esc(tr('hospital.evidenceHelp'))}</span></div><div class="field full"><button class="btn btn-secondary" type="button" data-action="fill-location">${icon('pin','icon-sm')} ${esc(tr('common.useLocation'))}</button></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="submit-hospital">${esc(tr('common.submit'))}</button>`
  });
}


function hospitalEvidenceModal(hospitalId) {
  openModal({
    title: tr('hospital.addEvidence'), subtitle: tr('hospital.evidenceHelp'),
    body: `<form id="hospital-evidence-form" data-hospital-id="${hospitalId}"><div class="field"><label>${esc(tr('hospital.evidence'))}</label><input class="input" name="evidence" type="file" accept="application/pdf,image/jpeg,image/png" required autofocus></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-hospital-evidence">${esc(tr('common.submit'))}</button>`
  });
}

async function hospitalDocumentsModal(hospitalId) {
  try {
    const documents = await apiFetch(`/hospitals/${hospitalId}/documents`);
    openModal({
      title: tr('hospital.reviewEvidence'), subtitle: tr('hospital.reviewEvidenceHelp'),
      body: documents.length ? `<div class="document-list">${documents.map(document => `<article><span class="document-icon">${icon('file')}</span><span><strong>${esc(document.original_filename)}</strong><small>${esc(document.content_type)} · ${Math.ceil(document.size_bytes / 1024)} KB · ${esc(fmtDate(document.created_at))}</small></span><button class="btn btn-secondary btn-sm" data-action="download-hospital-document" data-hospital-id="${hospitalId}" data-document-id="${document.id}" data-filename="${esc(document.original_filename)}">${esc(tr('common.view'))}</button></article>`).join('')}</div>` : emptyState('file','hospital.noEvidence','hospital.noEvidenceHelp')
    });
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

function inventoryModal() {
  openModal({
    title: tr('inventory.record'), subtitle: tr('inventory.recordHelp'),
    body: `<form id="inventory-form" class="form-grid"><div class="field"><label>${esc(tr('common.bloodGroup'))}</label><select class="select" name="blood_type">${['A+','A-','B+','B-','AB+','AB-','O+','O-','BOMBAY'].map(value => `<option>${value}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('common.component'))}</label><select class="select" name="component_type">${['PRBC','SDP','RDP','FFP','CRYOPRECIPITATE','WHOLE_BLOOD'].map(value => `<option value="${value}">${esc(domainLabel('component', value))}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('inventory.movement'))}</label><select class="select" name="event_type">${['RECEIPT','ISSUE','DISCARD','ADJUSTMENT'].map(value => `<option value="${value}">${esc(domainLabel('inventoryEvent', value))}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('inventory.units'))}</label><input class="input" name="units" type="number" min="1" value="1" required></div><div class="field"><label>${esc(tr('inventory.reference'))}</label><input class="input" name="reference" required></div><div class="field"><label>${esc(tr('inventory.minimum'))}</label><input class="input" name="minimum_level" type="number" min="0" value="2"></div><div class="field full"><label>${esc(tr('inventory.reason'))}</label><textarea class="textarea" name="reason"></textarea></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-inventory">${esc(tr('common.save'))}</button>`
  });
}

function requestModal() {
  openModal({
    title: tr('requests.create'), subtitle: tr('requests.createHelp'), wide: true,
    body: `<form id="request-form" class="form-grid"><div class="field"><label>${esc(tr('requests.patientReference'))}</label><input class="input" name="patient_reference" required></div><div class="field"><label>${esc(tr('common.bloodGroup'))}</label><select class="select" name="blood_type">${['O-','O+','A-','A+','B-','B+','AB-','AB+','BOMBAY'].map(value => `<option>${value}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('common.component'))}</label><select class="select" name="component_type">${['PRBC','SDP','RDP','FFP','CRYOPRECIPITATE','WHOLE_BLOOD'].map(value => `<option value="${value}">${esc(domainLabel('component', value))}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('common.units'))}</label><input class="input" name="units_needed" type="number" min="1" max="20" value="2" required></div><div class="field"><label>${esc(tr('requests.urgency'))}</label><select class="select" name="urgency">${['HIGH','MEDIUM','LOW','RARE_STANDBY','CRITICAL_PPH'].map(value => `<option value="${value}">${esc(domainLabel('urgency', value))}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('requests.validHours'))}</label><input class="input" name="expires_in_hours" type="number" min="1" max="12" value="8"></div><div class="field full"><label>${esc(tr('requests.document'))}</label><input class="input" name="slip" type="file" accept="application/pdf,image/jpeg,image/png" required></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-request">${esc(tr('common.submit'))}</button>`
  });
}

function requestReviewModal(requestId) {
  const request = state.hospitalRequests.find(item => item.id === requestId); if (!request) return;
  const fields = request.ocr_fields || {};
  const matched = request.ocr_status === 'OCR_MATCHED_REVIEW_REQUIRED';
  const candidate = value => Array.isArray(value) ? value.join(', ') : (value || tr('common.none'));
  openModal({
    title:tr('requests.reviewDocument'), subtitle:tr('requests.reviewDocumentHelp'),
    body:`<form id="request-review-form" data-request-id="${request.id}"><div class="ocr-review-grid"><div><span>${esc(tr('common.bloodGroup'))}</span><strong>${esc(candidate(fields.blood_groups))}</strong></div><div><span>${esc(tr('requests.documentDate'))}</span><strong>${esc(candidate(fields.document_dates))}</strong></div><div><span>${esc(tr('hospital.facility'))}</span><strong>${esc(candidate(fields.facility_candidates))}</strong></div><div><span>${esc(tr('common.status'))}</span><strong>${esc(statusLabel(request.ocr_status))}</strong></div></div><div class="config-warning">${icon('alert','icon-sm')} ${esc(tr('requests.ocrNotAuthenticity'))}</div><div class="attestation-block"><label><input type="checkbox" name="physician_registration_confirmed" required><span><strong>${esc(tr('requests.physicianConfirmed'))}</strong></span></label><label><input type="checkbox" name="component_confirmed" required><span><strong>${esc(tr('requests.componentConfirmed'))}</strong></span></label><label><input type="checkbox" name="document_review_confirmed" required><span><strong>${esc(tr('requests.documentReviewed'))}</strong></span></label>${matched ? '' : `<label><input type="checkbox" name="ocr_mismatch_resolved" required><span><strong>${esc(tr('requests.manualResolution'))}</strong></span></label>`}</div><div class="field"><label>${esc(tr('common.note'))}</label><textarea class="textarea" name="review_note" required></textarea></div></form>`,
    footer:`<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-request-review">${esc(tr('requests.verify'))}</button>`
  });
}

function receiveComponentModal(scannedCode = '') {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  openModal({
    title: tr('components.receive'), subtitle: tr('components.scanExistingHelp'),
    body: `<form id="component-receive-form" class="form-grid"><div class="field full"><label>${esc(tr('components.scannedCode'))}</label><input class="input" name="scanned_code" value="${esc(scannedCode)}" required minlength="6" autofocus><span class="field-hint">${esc(tr('components.noCertifiedGeneration'))}</span></div><div class="field full scan-actions"><button class="btn btn-secondary" type="button" data-action="start-unit-camera">${icon('camera','icon-sm')} ${esc(tr('intake.openCamera'))}</button><label class="btn btn-secondary file-button">${icon('upload','icon-sm')} ${esc(tr('components.scanLabelPhoto'))}<input id="unit-barcode-image" type="file" accept="image/*" capture="environment" hidden></label></div><div class="field"><label>${esc(tr('components.receivedAt'))}</label><input class="input" name="received_at" type="datetime-local" value="${now.toISOString().slice(0,16)}" required></div><div class="field"><label>${esc(tr('components.temperature'))}</label><input class="input" name="temperature_c" type="number" min="-80" max="40" step="0.1" required></div><div class="field full"><label>${esc(tr('common.reference'))}</label><input class="input" name="event_reference" required placeholder="GRN / receipt / scan event"></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-component-receipt">${esc(tr('components.receive'))}</button>`
  });
}

function componentPolicyModal() {
  openModal({
    title: tr('components.policies'), subtitle: tr('components.policyHelp'),
    body: `<form id="component-policy-form" class="form-grid"><div class="field"><label>${esc(tr('common.component'))}</label><select class="select" name="component_type">${['WHOLE_BLOOD','PRBC','RBC','SDP','RDP','PLATELETS','FFP','CRYOPRECIPITATE'].map(value => `<option value="${value}">${esc(domainLabel('component',value))}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('components.shelfLifeHours'))}</label><input class="input" name="shelf_life_hours" type="number" min="1" max="20000" required></div><div class="field"><label>${esc(tr('components.minimumTemperature'))}</label><input class="input" name="minimum_temperature_c" type="number" min="-80" max="40" step="0.1"></div><div class="field"><label>${esc(tr('components.maximumTemperature'))}</label><input class="input" name="maximum_temperature_c" type="number" min="-80" max="40" step="0.1"></div><div class="field full"><label>${esc(tr('components.policyReference'))}</label><input class="input" name="policy_reference" required minlength="3" placeholder="Facility SOP / regulatory reference"></div><label class="field full consent-row"><input type="checkbox" name="authorized_confirmation" required><span>${esc(tr('components.policyConfirmation'))}</span></label></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-component-policy">${esc(tr('common.save'))}</button>`
  });
}

function componentEventModal(componentId) {
  const component = state.components.find(item => item.id === componentId); if (!component) return;
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const gatedReason = value => {
    if (['RESERVED','RELEASED','ISSUED','TRANSFUSED'].includes(value) && ['EXPIRED','EXPIRES_WITHIN_24_HOURS'].includes(component.expiry_state)) return tr('components.expiredIssue');
    if (value === 'ISSUED' && component.status === 'ISSUED') return tr('components.alreadyIssued');
    if (value === 'TRANSFUSED' && component.status !== 'ISSUED') return tr('components.transfusedFromIssued');
    if (['TRANSFUSED','DISCARDED'].includes(value) && ['TRANSFUSED','DISCARDED'].includes(component.status)) return tr('components.finalizedImmutable');
    return '';
  };
  const blocked = ['RESERVED','RELEASED','ISSUED','TRANSFUSED','DISCARDED','QUARANTINED'].map(gatedReason).filter(Boolean);
  openModal({
    title: tr('components.recordEvent'), subtitle: component.component_reference,
    body: `<form id="component-event-form" data-component-id="${component.id}" class="form-grid">${blocked.length ? `<div class="config-warning full locked-warning">${icon('lock','icon-sm')} ${esc(blocked[0])}</div>` : ''}<div class="field"><label>${esc(tr('common.status'))}</label><select class="select" name="event_type">${['RESERVED','RELEASED','ISSUED','TRANSFUSED','DISCARDED','QUARANTINED'].map(value => { const reason = gatedReason(value); return `<option value="${value}" ${reason ? `disabled title="${esc(`${tr('components.notPermitted')}: ${reason}`)}"` : ''}>${esc(statusLabel(value))}${reason ? ` — ${esc(tr('components.notPermitted'))}` : ''}</option>`; }).join('')}</select></div><div class="field"><label>${esc(tr('common.date'))}</label><input class="input" name="occurred_at" type="datetime-local" value="${now.toISOString().slice(0,16)}" required></div><div class="field"><label>${esc(tr('components.temperatureOptional'))}</label><input class="input" name="temperature_c" type="number" min="-80" max="40" step="0.1"></div><div class="field"><label>${esc(tr('common.reference'))}</label><input class="input" name="event_reference" required></div><div class="field full"><label>${esc(tr('common.note'))}</label><textarea class="textarea" name="note"></textarea></div><label class="field full consent-row"><input type="checkbox" name="authorized_confirmation" required><span>${esc(tr('components.eventConfirmation'))}</span></label><div class="config-note">${icon('lock','icon-sm')} ${esc(tr('components.noPatientIdentity'))}</div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-component-event">${esc(tr('common.save'))}</button>`
  });
}

function splitComponentModal(componentId) {
  const component = state.components.find(item => item.id === componentId); if (!component) return;
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const row = index => `<div class="component-prep-row"><input class="input" name="reference_${index}" placeholder="${esc(tr('common.unitReference'))}${index === 1 ? '' : ` ${index}`}" ${index === 1 ? 'required' : ''}><select class="select" name="type_${index}">${['PRBC','RBC','SDP','RDP','PLATELETS','FFP','CRYOPRECIPITATE'].map(value => `<option value="${value}">${esc(domainLabel('component',value))}</option>`).join('')}</select><input class="input" name="isbt_${index}" placeholder="${esc(tr('components.existingIsbtOptional'))}"><input class="input" name="volume_${index}" type="number" min="1" max="2000" placeholder="mL"></div>`;
  openModal({
    title: tr('components.separate'), subtitle: component.component_reference, wide: true,
    body: `<form id="component-split-form" data-component-id="${component.id}"><div class="field"><label>${esc(tr('components.preparedAt'))}</label><input class="input" name="prepared_at" type="datetime-local" value="${now.toISOString().slice(0,16)}" required></div><div class="component-prep-grid">${row(1)}${row(2)}${row(3)}</div><label class="field full consent-row"><input type="checkbox" name="sop_confirmation" required><span>${esc(tr('components.sopConfirmation'))}</span></label><div class="config-note">${icon('alert','icon-sm')} ${esc(tr('components.expiryCalculatedFromPolicy'))}</div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-component-split">${esc(tr('common.save'))}</button>`
  });
}

function handoverModal(componentId) {
  const component = state.components.find(item => item.id === componentId); if (!component) return;
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const destinations = state.facilityCentres.filter(item => item.id !== state.hospitalProfile?.id);
  openModal({
    title: tr('components.handover'), subtitle: component.component_reference,
    body: `<form id="handover-form" data-component-id="${component.id}" class="form-grid"><div class="field full"><label>${esc(tr('components.destination'))}</label><select class="select" name="to_hospital_id" required><option value="">${esc(tr('common.select'))}</option>${destinations.map(item => `<option value="${item.id}">${esc(item.name)} · ${esc(item.city)}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('components.handedOverAt'))}</label><input class="input" name="handed_over_at" type="datetime-local" value="${now.toISOString().slice(0,16)}" required></div><div class="field"><label>${esc(tr('components.temperature'))}</label><input class="input" name="dispatch_temperature_c" type="number" min="-80" max="40" step="0.1" required></div><div class="field full"><label>${esc(tr('components.containerReference'))}</label><input class="input" name="container_reference" required></div><div class="field full"><label>${esc(tr('common.note'))}</label><textarea class="textarea" name="notes"></textarea></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-handover">${esc(tr('common.confirm'))}</button>`
  });
}

function receiveHandoverModal(handoverId) {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  openModal({
    title: tr('components.confirmReceipt'), subtitle: tr('components.receiveHandoverHelp'),
    body: `<form id="handover-receive-form" data-handover-id="${handoverId}" class="form-grid"><div class="field"><label>${esc(tr('components.receivedAt'))}</label><input class="input" name="received_at" type="datetime-local" value="${now.toISOString().slice(0,16)}" required></div><div class="field"><label>${esc(tr('components.temperature'))}</label><input class="input" name="receipt_temperature_c" type="number" min="-80" max="40" step="0.1" required></div><div class="field full"><label>${esc(tr('common.note'))}</label><textarea class="textarea" name="notes"></textarea></div><label class="field full consent-row"><input type="checkbox" name="receipt_confirmation" required><span>${esc(tr('components.receiptConfirmation'))}</span></label></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-handover-receipt">${esc(tr('common.confirm'))}</button>`
  });
}

async function componentHistoryModal(componentId) {
  try {
    const events = await apiFetch(`/components/${componentId}/events`);
    openModal({
      title: tr('components.history'), subtitle: tr('components.historyHelp'),
      body: events.length ? `<div class="timeline">${events.map(item => `<article><span>${icon('activity','icon-sm')}</span><div><strong>${esc(statusLabel(item.event_type))}</strong><p>${esc(fmtDate(item.occurred_at))}${item.temperature_c != null ? ` · ${esc(item.temperature_c)} °C` : ''}</p><small>${esc(item.event_reference || '')}</small></div></article>`).join('')}</div>` : emptyState('activity','components.noEvents','components.noEventsHelp')
    });
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

function privacyRequestModal() {
  openModal({
    title:tr('privacy.request'), subtitle:tr('privacy.requestHelp'),
    body:`<form id="privacy-request-form"><div class="field"><label>${esc(tr('privacy.requestType'))}</label><select class="select" name="request_type">${['ACCESS','CORRECTION','ERASURE','CONSENT_WITHDRAWAL','NOMINATION','GRIEVANCE'].map(value => `<option value="${value}">${esc(domainLabel('privacyRequest',value))}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('privacy.details'))}</label><textarea class="textarea" name="details" minlength="10" maxlength="2000" required></textarea></div><div class="config-note">${icon('shield','icon-sm')} ${esc(tr('privacy.retentionNotice'))}</div></form>`,
    footer:`<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-privacy-request">${esc(tr('common.submit'))}</button>`
  });
}

function inviteModal() {
  const roles = [['ROLE_DONOR','role.donor'],['ROLE_ORGANIZER','role.organizer'],['ROLE_HOSPITAL','role.hospital'],['ROLE_HOST_VENUE','role.venue'],['ROLE_SUPER_ADMIN','role.admin']];
  openModal({
    title: tr('admin.invite'), subtitle: tr('admin.inviteHelp'),
    body: `<form id="invite-form"><div class="field"><label>${esc(tr('common.email'))}</label><input class="input" name="email" type="email" required autofocus></div><fieldset class="role-check-grid"><legend>${esc(tr('common.roles'))}</legend>${roles.map(([value,key]) => `<label><input type="checkbox" name="roles" value="${value}"><span class="role-option-icon">${icon(roleConfig[Object.keys(roleConfig).find(id => roleConfig[id].claim === value)]?.icon || 'shield')}</span><span><strong>${esc(tr(key))}</strong></span></label>`).join('')}</fieldset></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="send-invite">${esc(tr('common.send'))}</button>`
  });
}

function rolesModal(userId) {
  const user = state.adminUsers.find(item => item.id === userId);
  if (!user) return;
  const roles = [['ROLE_DONOR','role.donor'],['ROLE_ORGANIZER','role.organizer'],['ROLE_HOSPITAL','role.hospital'],['ROLE_HOST_VENUE','role.venue'],['ROLE_SUPER_ADMIN','role.admin']];
  openModal({
    title: tr('admin.editRoles'), subtitle: user.email,
    body: `<form id="roles-form" data-user-id="${user.id}"><fieldset class="role-check-grid">${roles.map(([value,key]) => `<label><input type="checkbox" name="roles" value="${value}" ${user.roles.includes(value) ? 'checked' : ''}><span><strong>${esc(tr(key))}</strong></span></label>`).join('')}</fieldset></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-roles">${esc(tr('common.save'))}</button>`
  });
}

function reviewDecisionModal(screeningId, decision) {
  openModal({
    title: tr(decision === 'APPROVED' ? 'clinical.approveQr' : 'common.decline'), subtitle: tr('clinical.decisionHelp'),
    body: `<form id="review-form" data-screening-id="${screeningId}" data-decision="${decision}"><div class="field"><label>${esc(tr('common.note'))}</label><textarea class="textarea" name="note" required></textarea></div><div class="config-note">${icon('shield','icon-sm')} ${esc(tr('clinical.finalClearanceNotice'))}</div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-review">${esc(tr('common.confirm'))}</button>`
  });
}

function assessmentModal() {
  openModal({
    title: tr('intake.assess'), subtitle: tr('intake.assessHelp'),
    body: `<form id="assessment-form" class="form-grid"><div class="field"><label>${esc(tr('intake.decision'))}</label><select class="select" name="decision">${['CLEARED','DEFERRED'].map(value => `<option value="${value}">${esc(statusLabel(value))}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('intake.reasonCodes'))}</label><input class="input" name="reason_codes" placeholder="LOW_HB, BP_REVIEW"></div><div class="field"><label>${esc(tr('intake.hemoglobin'))}</label><input class="input" name="hemoglobin_g_dl" type="number" min="2" max="25" step="0.1"></div><div class="field"><label>${esc(tr('intake.pulse'))}</label><input class="input" name="pulse_bpm" type="number" min="30" max="220"></div><div class="field"><label>${esc(tr('intake.systolic'))}</label><input class="input" name="systolic_bp" type="number" min="50" max="260"></div><div class="field"><label>${esc(tr('intake.diastolic'))}</label><input class="input" name="diastolic_bp" type="number" min="30" max="180"></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-assessment">${esc(tr('common.save'))}</button>`
  });
}

function donationModal() {
  openModal({
    title: tr('intake.recordDonation'), subtitle: tr('intake.recordDonationHelp'),
    body: `<form id="donation-form" class="form-grid"><div class="field"><label>${esc(tr('common.unitReference'))}</label><input class="input" name="unit_reference" required></div><div class="field"><label>${esc(tr('common.component'))}</label><select class="select" name="component_type">${['WHOLE_BLOOD','PRBC','SDP','FFP'].map(value => `<option value="${value}">${esc(domainLabel('component', value))}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('common.bloodGroup'))}</label><select class="select" name="blood_type_at_collection">${['A+','A-','B+','B-','AB+','AB-','O+','O-','BOMBAY'].map(value => `<option ${state.intakeDonor?.blood_type === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="field"><label>${esc(tr('common.volume'))}</label><input class="input" name="volume_ml" type="number" value="450"></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="save-donation">${esc(tr('common.save'))}</button>`
  });
}

function campaignEmailModal(campaignId) {
  openModal({
    title: tr('campaign.email'), subtitle: tr('campaign.emailHelp'),
    body: `<form id="campaign-email-form" data-campaign-id="${campaignId}"><div class="field"><label>${esc(tr('campaign.recipient'))}</label><input class="input" name="recipient_email" type="email" required autofocus></div><div class="field"><label>${esc(tr('campaign.personalMessage'))}</label><textarea class="textarea" name="personal_message"></textarea></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button><button class="btn btn-primary" data-action="send-campaign-email">${esc(tr('common.send'))}</button>`
  });
}

function setBusy(form, busy) {
  form?.setAttribute('aria-busy', String(busy));
  for (const control of form?.querySelectorAll('button,input,select,textarea') || []) control.disabled = busy;
}

async function submitAuth(form, type) {
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  setBusy(form, true);
  try {
    if (type === 'signin') {
      state.screen = 'loading'; state.loadingKey = 'loading.signingIn'; closeModal(); render();
      await signInWithPassword(data.get('email'), data.get('password'));
    } else if (type === 'register') {
      if (data.get('password') !== data.get('confirm_password')) throw new Error('Passwords do not match.');
      const email = String(data.get('email')).trim().toLowerCase();
      await registerDonorWithPassword(email, data.get('password'));
      authModal('signin', email);
      toast('Verify your email once', 'Open the verification message, then return and sign in with your password.');
    } else {
      const email = String(data.get('email')).trim().toLowerCase();
      await sendPasswordReset(email);
      authModal('signin', email);
      toast('Check your email', 'If that account exists, Firebase sent password-reset instructions.');
    }
  } catch (error) {
    if (type === 'signin') { state.screen = 'landing'; render(); authModal('signin', String(data.get('email') || '')); }
    toast('Authentication not completed', authErrorMessage(error), 'warning');
  } finally {
    if (form.isConnected) setBusy(form, false);
  }
}

async function bootstrapSession(user) {
  state.screen = 'loading'; state.loadingKey = 'loading.workspace'; state.authError = ''; render();
  let account = null;
  // A cold Render service can refuse the first connection while it wakes up.
  // Retry transport failures (not API rejections) a couple of times with a
  // short pause before surfacing the error screen with the manual Retry button.
  for (let attempt = 1; attempt <= 3 && !account; attempt += 1) {
    try {
      prewarmApi();
      account = await apiFetch('/auth/bootstrap', { method: 'POST', body: '{}' });
    } catch (error) {
      if (error?.status || attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 3500));
    }
  }
  try {
    await user.getIdToken(true);
    state.authUser = user;
    state.account = account;
    const available = allowedRoles();
    if (!available.some(([id]) => id === state.role)) state.role = available[0]?.[0] || 'donor';
    const requestedRole = query.get('workspace');
    if (requestedRole && available.some(([id]) => id === requestedRole)) state.role = requestedRole;
    state.view = query.get('view') || roleConfig[state.role].landing;
    await loadAuthenticatedData();
    state.screen = 'app';
    render();
    if (state.campaignLanding && state.account.roles.includes('ROLE_DONOR')) {
      state.role = 'donor'; state.view = 'drives'; render();
      toast(tr('campaign.invitationReady'), tr('campaign.invitationReadyHelp'));
    }
  } catch (error) {
    state.authUser = user;
    state.authError = friendlyError(error);
    state.screen = 'landing';
    render();
  }
}

async function safeApi(path, fallback = null) {
  try { return await apiFetch(path); }
  catch (error) { console.warn(path, error); return fallback; }
}

function nearbyQuery() {
  const { latitude, longitude } = state.profile || {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&radius_km=100`;
}

async function loadNearbyData() {
  const queryString = nearbyQuery();
  if (state.account && state.preferences?.location_matching_opt_in === false) {
    state.publicDrives = []; state.publicRequests = []; state.publicCentres = [];
    return;
  }
  if (state.account?.roles?.includes('ROLE_DONOR') && !queryString) {
    state.publicDrives = []; state.publicRequests = []; state.publicCentres = [];
    return;
  }
  [state.publicDrives, state.publicRequests, state.publicCentres] = await Promise.all([
    publicApiFetch(`/drives/public${queryString}`).catch(() => []),
    publicApiFetch(`/public/requests${queryString}`).catch(() => []),
    publicApiFetch(`/public/centres${queryString}`).catch(() => [])
  ]);
}

async function loadPublicData() {
  if (!isApiConfigured()) return;
  const [config, stats] = await Promise.all([
    publicApiFetch('/public/config').catch(() => state.publicConfig),
    publicApiFetch('/public/stats').catch(() => null)
  ]);
  state.publicConfig = config || state.publicConfig;
  state.publicStats = stats;
  await loadNearbyData();
  if (state.campaignQuery) {
    try {
      state.campaignLanding = await publicApiFetch(`/public/campaigns/${encodeURIComponent(state.campaignQuery)}`);
      let visitorKey = storage.getItem('raktflow-visitor-key');
      if (!visitorKey) { visitorKey = crypto.randomUUID().replaceAll('-','_'); storage.setItem('raktflow-visitor-key', visitorKey); }
      publicApiFetch(`/public/campaigns/${encodeURIComponent(state.campaignQuery)}/visit`, { method: 'POST', body: JSON.stringify({ visitor_key: visitorKey }) }).catch(() => null);
    } catch { state.campaignLanding = null; }
  }
}

async function loadAuthenticatedData() {
  await loadPublicData();
  [state.preferences, state.consentHistory, state.privacyRequests] = await Promise.all([
    safeApi('/preferences/me', {
      appearance: state.theme.toUpperCase(), language: state.locale,
      in_app_notifications: true, email_notifications: false, sms_notifications: false,
      rare_blood_opt_in: false, location_matching_opt_in: true, donation_lifecycle_opt_in: false
    }),
    safeApi('/privacy/me/consents', []),
    safeApi('/privacy/me/requests', [])
  ]);
  if (state.preferences?.appearance && state.preferences.appearance !== 'SYSTEM') {
    state.theme = state.preferences.appearance.toLowerCase();
    document.documentElement.dataset.theme = state.theme;
  }
  if (state.preferences?.language && state.preferences.language !== state.locale) {
    state.locale = await loadLocale(state.preferences.language);
    setLocale(state.locale);
  }
  const roles = state.account.roles;
  state.hospitalProfile = await safeApi('/hospitals/me');
  state.hospitalDocuments = state.hospitalProfile ? await safeApi(`/hospitals/${state.hospitalProfile.id}/documents`, []) : [];
  if (roles.includes('ROLE_DONOR')) {
    state.profile = await safeApi('/donors/me/profile');
    await loadNearbyData();
    [state.registrations, state.donationHistory, state.donorAlerts, state.donorUnitNotifications] = await Promise.all([
      safeApi('/drives/registrations/mine', []), safeApi('/donors/me/donations', []),
      safeApi('/donors/me/alerts', []), safeApi('/donors/me/unit-notifications', [])
    ]);
  }
  if (roles.includes('ROLE_ORGANIZER') || roles.includes('ROLE_SUPER_ADMIN')) {
    state.verifiedNeeds = await publicApiFetch('/public/requests').catch(() => []);
    [state.drives, state.proposals, state.campaigns] = await Promise.all([
      safeApi('/drives/mine', []), safeApi('/drives/proposals/mine', []), safeApi('/campaigns/mine', [])
    ]);
    state.activeDriveId = state.drives.some(item => item.id === state.activeDriveId) ? state.activeDriveId : state.drives[0]?.id || null;
    await loadActiveDriveData();
    await loadCampaignStats();
  }
  if (roles.includes('ROLE_HOSPITAL') || roles.includes('ROLE_SUPER_ADMIN')) {
    state.clinicalQueue = await safeApi('/clinical/screenings?review_status=ALL', []);
    if (state.hospitalProfile?.status === 'VERIFIED') {
      state.facilityCentres = await publicApiFetch('/public/centres').catch(() => []);
      [state.inventory, state.inventoryEvents, state.hospitalRequests, state.components, state.componentExpiry, state.componentPolicies, state.handovers] = await Promise.all([
        safeApi('/hospitals/inventory/me', []), safeApi('/hospitals/inventory/events', []),
        safeApi('/requests/mine', []), safeApi('/components/mine', []),
        safeApi('/components/expiry-summary', {}), safeApi('/components/policies/mine', []),
        safeApi('/components/handovers/mine', [])
      ]);
      const rareHistories = await Promise.all(
        state.hospitalRequests
          .filter(item => item.urgency === 'RARE_STANDBY' && item.status === 'VERIFIED')
          .map(async item => [item.id, await safeApi(`/logistics/rare/${item.id}/history`, null)])
      );
      state.rareDispatchHistory = Object.fromEntries(rareHistories.filter(([, history]) => history));
    }
  }
  if (roles.includes('ROLE_HOST_VENUE')) {
    if (!roles.includes('ROLE_ORGANIZER')) state.proposals = await safeApi('/drives/proposals/mine', []);
    state.hostImpact = await safeApi('/drives/proposals/host-impact', []);
  }
  if (roles.includes('ROLE_SUPER_ADMIN')) await loadAdminData();
}

async function loadActiveDriveData() {
  if (!state.activeDriveId) {
    state.roster = []; state.reconciliation = null; state.driveQuotas = []; state.quotaRecommendations = []; return;
  }
  [state.roster, state.reconciliation, state.driveQuotas, state.quotaRecommendations] = await Promise.all([
    safeApi(`/drives/${state.activeDriveId}/roster`, []),
    safeApi(`/drives/${state.activeDriveId}/reconciliation`),
    safeApi(`/drives/${state.activeDriveId}/quotas`, []),
    safeApi(`/drives/${state.activeDriveId}/quota-recommendations`, [])
  ]);
}

async function loadCampaignStats() {
  const results = await Promise.all(state.campaigns.map(async campaign => [campaign.id, await safeApi(`/campaigns/${campaign.id}/stats`, { unique_visitors:0, registrations:0, conversion_percent:0 })]));
  state.campaignStats = Object.fromEntries(results);
}

async function loadAdminData() {
  [state.adminOverview, state.adminUsers, state.invitations, state.hospitalApplications, state.adminData, state.audit, state.adminPrivacyRequests] = await Promise.all([
    safeApi('/admin/overview', {}), safeApi('/admin/users', []), safeApi('/admin/invitations', []),
    safeApi('/hospitals/applications', []), safeApi('/admin/data', {}), safeApi('/admin/audit', []),
    safeApi('/privacy/admin/requests', [])
  ]);
}

async function refreshCurrent() {
  state.screen = 'loading'; state.loadingKey = 'loading.refreshing'; render();
  await loadAuthenticatedData();
  state.screen = 'app'; render();
}

function applyAppearance(appearance) {
  const normalized = ['LIGHT','DARK','SYSTEM'].includes(appearance) ? appearance : 'SYSTEM';
  state.preferences = { ...(state.preferences || {}), appearance: normalized };
  state.theme = normalized === 'SYSTEM'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : normalized.toLowerCase();
  storage.setItem('raktflow-theme', state.theme);
  document.documentElement.dataset.theme = state.theme;
}

async function savePreferences(quiet = false) {
  const existing = state.preferences || {};
  const previousLocationMatching = existing.location_matching_opt_in ?? true;
  const payload = {
    appearance: existing.appearance || state.theme.toUpperCase(), language: state.locale,
    in_app_notifications: existing.in_app_notifications ?? true,
    email_notifications: existing.email_notifications ?? false,
    sms_notifications: existing.sms_notifications ?? false,
    rare_blood_opt_in: existing.rare_blood_opt_in ?? false,
    location_matching_opt_in: existing.location_matching_opt_in ?? true,
    donation_lifecycle_opt_in: existing.donation_lifecycle_opt_in ?? false,
  };
  for (const input of document.querySelectorAll('[data-preference]')) payload[input.dataset.preference] = input.checked;
  try {
    state.preferences = await apiFetch('/preferences/me', { method:'PUT', body:JSON.stringify(payload) });
    if (previousLocationMatching && !state.preferences.location_matching_opt_in && state.profile) {
      state.profile.latitude = null; state.profile.longitude = null;
      state.publicDrives=[]; state.publicRequests=[]; state.publicCentres=[];
    }
    if (!previousLocationMatching && state.preferences.location_matching_opt_in && !state.profile?.latitude) {
      toast(tr('settings.locationNeededTitle'),tr('settings.locationNeededHelp'),'warning');
    }
    if (!quiet) toast(tr('success.title'), tr('settings.saved'));
    render();
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function downloadPersonalData() {
  try {
    const data = await apiFetch('/privacy/me/export');
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const anchor=document.createElement('a'); anchor.href=URL.createObjectURL(blob);
    anchor.download=`raktflow-personal-data-${new Date().toISOString().slice(0,10)}.json`; anchor.click();
    setTimeout(()=>URL.revokeObjectURL(anchor.href),1000);
    toast(tr('success.title'),tr('privacy.exportReady'));
  } catch(error){toast(tr('error.title'),friendlyError(error),'warning');}
}

async function savePrivacyRequest() {
  const form=document.querySelector('#privacy-request-form'); if(!form?.reportValidity()) return;
  const data=new FormData(form);
  try {
    await apiFetch('/privacy/me/requests',{method:'POST',body:JSON.stringify({request_type:data.get('request_type'),details:data.get('details')})});
    state.privacyRequests=await apiFetch('/privacy/me/requests'); state.preferences=await apiFetch('/preferences/me');
    if (data.get('request_type') === 'CONSENT_WITHDRAWAL' && state.profile) {
      state.profile.latitude=null; state.profile.longitude=null; state.publicDrives=[]; state.publicRequests=[]; state.publicCentres=[];
    }
    closeModal();render();toast(tr('success.title'),tr('privacy.requestSaved'));
  } catch(error){toast(tr('error.title'),friendlyError(error),'warning');}
}

async function decidePrivacyRequest(id,nextStatus) {
  const note=window.prompt(tr('privacy.resolutionNote'),'') ?? ''; if(!note.trim()) return;
  try { await apiFetch(`/privacy/admin/requests/${id}`,{method:'PATCH',body:JSON.stringify({status:nextStatus,resolution_note:note})}); state.adminPrivacyRequests=await apiFetch('/privacy/admin/requests');render();toast(tr('success.title'),tr('privacy.decisionSaved')); }
  catch(error){toast(tr('error.title'),friendlyError(error),'warning');}
}

async function readUnitNotification(id) {
  try {
    await apiFetch(`/donors/me/unit-notifications/${id}/read`, { method:'POST' });
    state.donorUnitNotifications = await apiFetch('/donors/me/unit-notifications');
    render();
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function respondRareAlert(id, response) {
  try {
    await apiFetch(`/donors/me/alerts/${id}/response`, {
      method:'POST', body:JSON.stringify({ response })
    });
    state.donorAlerts = await apiFetch('/donors/me/alerts');
    render();
    toast(tr('success.title'), tr('rare.responseSaved'));
  } catch (error) { toast(tr('error.title'),friendlyError(error),'warning'); }
}

async function updateRareDispatch(requestId, expand = false) {
  try {
    await apiFetch(
      expand ? `/logistics/rare/${requestId}/expand` : '/logistics/rare/dispatch',
      { method:'POST', body:expand ? '{}' : JSON.stringify({ request_id:requestId }) }
    );
    state.rareDispatchHistory[requestId] = await apiFetch(`/logistics/rare/${requestId}/history`);
    render();
    toast(tr('success.title'), tr(expand ? 'rare.cohortExpanded' : 'rare.matchingStarted'));
  } catch (error) { toast(tr('error.title'),friendlyError(error),'warning'); }
}

async function refreshEligibility() {
  try {
    state.profile = await apiFetch('/donors/me/profile');
    render();
    toast(tr('success.title'), tr('donor.reviewRefreshed'));
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function saveProfile() {
  const form = document.querySelector('#profile-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  if (!data.get('latitude') || !data.get('longitude')) {
    toast(tr('error.title'),tr('profile.locationRequired'),'warning'); return;
  }
  const payload = { full_name:data.get('full_name'), date_of_birth:data.get('date_of_birth'), phone:data.get('phone'), city:data.get('city'), latitude:Number(data.get('latitude')), longitude:Number(data.get('longitude')), blood_type:data.get('blood_type'), consent_to_process:data.has('consent_to_process'), emergency_notifications:false };
  try { state.profile = await apiFetch('/donors/me/profile', { method:'PUT', body:JSON.stringify(payload) }); state.preferences=await apiFetch('/preferences/me'); await loadNearbyData(); closeModal(); render(); toast(tr('success.title'), tr('success.profileSaved')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

function parseAnswer(value) { return value === 'null' ? null : value === 'true'; }
const SCREENING_DATE_DEPENDS_ON = {
  antibiotics_completed_date: 'fever_infection_or_antibiotics',
  surgery_or_transfusion_date: 'surgery_transfusion_or_hospitalization_last_12_months',
  tattoo_or_piercing_date: 'tattoo_or_piercing_last_12_months',
  malaria_risk_return_date: 'malaria_risk_travel_or_residence',
  delivery_or_pregnancy_end_date: 'pregnancy_breastfeeding_or_recent_delivery'
};

async function saveScreening() {
  const form = document.querySelector('#screening-form'); if (!form) return;
  const data = new FormData(form);
  const weight = Number(data.get('weight_kg'));
  if (!Number.isFinite(weight) || weight < 25 || weight > 250) {
    toast(tr('error.title'), tr('screening.weightHint'), 'warning'); return;
  }
  // Every question needs an answer so the clinical review is meaningful.
  // The date fields themselves are never force-required: they are validated
  // below only when the linked answer is "Yes".
  const questionMap = Object.fromEntries(SCREENING_YES_FIELDS);
  const unanswered = SCREENING_YES_FIELDS.filter(([name]) => !data.get(name));
  if (unanswered.length) {
    const first = document.querySelector(`input[name="${unanswered[0][0]}"]`);
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' }); first?.focus();
    toast(tr('error.title'), `${tr('screening.answerAll')} — ${tr(unanswered[0][1])}`, 'warning'); return;
  }
  for (const [dateName, dependsOn] of Object.entries(SCREENING_DATE_DEPENDS_ON)) {
    const answer = data.get(dependsOn);
    if (answer === 'true' && !data.get(dateName)) {
      const labelKey = questionMap[dependsOn] || 'common.date';
      toast(tr('error.title'), `${tr(labelKey)}: ${tr('screening.dateRequired')}`, 'warning'); return;
    }
  }
  if (!data.has('answers_are_truthful') || !data.has('consent_to_clinical_review')) {
    toast(tr('error.title'), tr('screening.consentsRequired'), 'warning'); return;
  }
  const names = ['feeling_well_today','fever_infection_or_antibiotics','medication_requires_review','heart_lung_kidney_liver_or_bleeding_condition','surgery_transfusion_or_hospitalization_last_12_months','tattoo_or_piercing_last_12_months','malaria_risk_travel_or_residence','pregnancy_breastfeeding_or_recent_delivery','alcohol_within_24_hours','recent_immunization_14_days'];
  const payload = {
    questionnaire_version:'IN-PRECHECK-2026-02', weight_kg:weight,
    last_donation_date:data.get('last_donation_date') || null,
    antibiotics_completed_date:data.get('antibiotics_completed_date') || null,
    surgery_or_transfusion_date:data.get('surgery_or_transfusion_date') || null,
    tattoo_or_piercing_date:data.get('tattoo_or_piercing_date') || null,
    malaria_risk_return_date:data.get('malaria_risk_return_date') || null,
    delivery_or_pregnancy_end_date:data.get('delivery_or_pregnancy_end_date') || null,
    answers_are_truthful:data.has('answers_are_truthful'),
    consent_to_clinical_review:data.has('consent_to_clinical_review')
  };
  names.forEach(name => payload[name] = parseAnswer(data.get(name)));
  // Conditional dates: only send a date when its question was answered Yes.
  for (const dateName of Object.keys(SCREENING_DATE_DEPENDS_ON)) {
    const dependsOn = SCREENING_DATE_DEPENDS_ON[dateName];
    if (payload[dependsOn] !== true) payload[dateName] = null;
  }
  // A sleeping free-tier API drops the first connection. Wait for it, then
  // submit; if the submit still fails on a network drop after the API is up,
  // retry exactly once — the user should never have to tap twice.
  let submitted = false;
  for (let attempt = 1; attempt <= 2 && !submitted; attempt += 1) {
    // Wait silently through a short cold start before alarming the user; only
    // show the waking toast when the API is genuinely still down after ~26s.
    if (!(await pingApi(20000)) && !(await waitForApi({ maxMs: 20000 }))) {
      toast(tr('error.title'), tr('error.backendWaking'), 'warning');
      await waitForApi();
    }
    try {
      await apiFetch('/donors/me/screenings', { method: 'POST', body: JSON.stringify(payload) });
      submitted = true;
    } catch (error) {
      const raw = String(error?.message || '');
      if (/review_hospital_id|consent_to_selected_facility_review|IN-PRECHECK-2026-01/i.test(raw)) {
        toast(tr('error.title'), tr('error.outdatedApi'), 'warning'); return;
      }
      if (/could not reach|cors|timed out/i.test(raw) && attempt === 1) {
        toast(tr('error.title'), tr('error.backendWaking'), 'warning');
        await waitForApi();
        continue;
      }
      if (/could not reach|cors|timed out/i.test(raw)) {
        const alive = await pingApi(20000);
        toast(tr('error.title'), tr(alive ? 'error.backendWaking' : 'error.backendConnection'), 'warning');
        return;
      }
      toast(tr('error.title'), friendlyError(error), 'warning'); return;
    }
  }
  if (submitted) {
    state.profile = await apiFetch('/donors/me/profile').catch(() => state.profile);
    closeModal(); render(); toast(tr('success.title'), tr('success.screeningSubmitted'));
  }
}


async function saveDrive() {
  const form = document.querySelector('#drive-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const startsAt = new Date(data.get('starts_at'));
  const endsAt = new Date(data.get('ends_at'));
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    toast(tr('error.title'), tr('organizer.invalidWindow'), 'warning'); return;
  }
  const latitude = String(data.get('latitude') || '').trim();
  const longitude = String(data.get('longitude') || '').trim();
  if (Boolean(latitude) !== Boolean(longitude)) { toast(tr('error.title'), tr('organizer.coordinatesTogether'), 'warning'); return; }
  const payload = { name:data.get('name'), venue_name:data.get('venue_name'), address:data.get('address'), target_units:Number(data.get('target_units')), starts_at:startsAt.toISOString(), ends_at:endsAt.toISOString(), latitude:latitude ? Number(latitude) : null, longitude:longitude ? Number(longitude) : null };
  try { const created = await apiFetch('/drives', { method:'POST', body:JSON.stringify(payload) }); closeModal(); state.drives = await apiFetch('/drives/mine'); state.activeDriveId = created.id; await loadActiveDriveData(); render(); toast(tr('success.title'), tr('success.driveCreated')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function saveQuotas() {
  const form = document.querySelector('#quota-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const groups = ['A+','A-','B+','B-','AB+','AB-','O+','O-','BOMBAY'];
  const quotas = groups.map(bloodType => ({
    blood_type: bloodType, max_registrations: Number(data.get(`max_${bloodType}`)),
    source_request_id: data.get(`request_${bloodType}`) || null,
    rationale: String(data.get(`reason_${bloodType}`) || ''), active: data.has(`active_${bloodType}`)
  }));
  try {
    state.driveQuotas = await apiFetch(`/drives/${form.dataset.driveId}/quotas`, { method:'PUT', body:JSON.stringify({ quotas }) });
    closeModal(); render(); toast(tr('success.title'), tr('quota.saved'));
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function saveProposal() {
  const form = document.querySelector('#proposal-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = { host_email:data.get('host_email'), proposed_name:data.get('proposed_name'), venue_name:data.get('venue_name'), address:data.get('address'), starts_at:new Date(data.get('starts_at')).toISOString(), ends_at:new Date(data.get('ends_at')).toISOString(), target_units:Number(data.get('target_units')), latitude:Number(data.get('latitude')), longitude:Number(data.get('longitude')), recovery_seats:Number(data.get('recovery_seats')), power_available:data.has('power_available'), wifi_available:data.has('wifi_available'), parking_available:data.has('parking_available'), privacy_partitions:data.has('privacy_partitions') };
  try { await apiFetch('/drives/proposals', { method:'POST', body:JSON.stringify(payload) }); closeModal(); state.proposals = await apiFetch('/drives/proposals/mine'); render(); toast(tr('success.title'), tr('success.proposalSent')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function saveCampaign() {
  const form = document.querySelector('#campaign-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = { drive_id:data.get('drive_id'), slug:data.get('slug'), title:data.get('title'), description:data.get('description'), poster:{ headline:data.get('headline'), subheading:data.get('subheading'), organizer_name:data.get('organizer_name'), call_to_action:data.get('call_to_action'), accent_color:data.get('accent_color') } };
  try {
    const id = form.dataset.campaignId;
    if (id) { delete payload.drive_id; await apiFetch(`/campaigns/${id}`, { method:'PATCH', body:JSON.stringify(payload) }); }
    else await apiFetch('/campaigns', { method:'POST', body:JSON.stringify(payload) });
    closeModal(); state.campaigns = await apiFetch('/campaigns/mine'); await loadCampaignStats(); render(); toast(tr('success.title'), tr('success.campaignSaved'));
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function submitHospital() {
  const form = document.querySelector('#hospital-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = { facility_name:data.get('facility_name'), registration_number:data.get('registration_number'), institutional_email:data.get('institutional_email'), phone:data.get('phone'), address:data.get('address'), city:data.get('city'), state:data.get('state'), latitude:data.get('latitude') ? Number(data.get('latitude')) : null, longitude:data.get('longitude') ? Number(data.get('longitude')) : null };
  try {
    state.hospitalProfile = await apiFetch('/hospitals/applications', { method:'POST', body:JSON.stringify(payload) });
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); return; }
  try {
    await uploadHospitalEvidence(state.hospitalProfile.id, data.get('evidence'));
    closeModal(); render(); toast(tr('success.title'), tr('success.applicationSent'));
  } catch (error) {
    closeModal(); render();
    toast(tr('error.title'), tr('hospital.evidenceRetry'), 'warning');
    console.warn(error);
  }
}


async function uploadHospitalEvidence(hospitalId, file) {
  const upload = new FormData(); upload.append('upload', file);
  await apiFetch(`/hospitals/${hospitalId}/documents`, { method:'POST', body:upload });
  state.hospitalDocuments = await apiFetch(`/hospitals/${hospitalId}/documents`);
}

async function saveHospitalEvidence() {
  const form = document.querySelector('#hospital-evidence-form'); if (!form?.reportValidity()) return;
  try {
    await uploadHospitalEvidence(form.dataset.hospitalId, new FormData(form).get('evidence'));
    closeModal(); render(); toast(tr('success.title'), tr('success.evidenceUploaded'));
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function downloadHospitalDocument(hospitalId, documentId, filename) {
  try {
    const { blob } = await apiDownload(`/hospitals/${hospitalId}/documents/${documentId}`);
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob); anchor.download = filename || 'facility-evidence'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function saveInventory() {
  const form = document.querySelector('#inventory-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = { blood_type:data.get('blood_type'), phenotype_code:null, component_type:data.get('component_type'), event_type:data.get('event_type'), adjustment_direction:data.get('event_type') === 'ADJUSTMENT' ? 'INCREASE' : null, units:Number(data.get('units')), reference:data.get('reference'), reason:data.get('reason'), minimum_level:Number(data.get('minimum_level')) };
  try { await apiFetch('/hospitals/inventory/events', { method:'POST', body:JSON.stringify(payload) }); closeModal(); state.inventory = await apiFetch('/hospitals/inventory/me'); render(); toast(tr('success.title'), tr('success.inventorySaved')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function reloadComponents() {
  [state.components, state.componentExpiry, state.componentPolicies, state.handovers] = await Promise.all([
    apiFetch('/components/mine'), apiFetch('/components/expiry-summary'),
    apiFetch('/components/policies/mine'), apiFetch('/components/handovers/mine')
  ]);
}

async function saveComponentReceipt() {
  const form = document.querySelector('#component-receive-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = {
    scanned_code:String(data.get('scanned_code')).trim(), received_at:new Date(data.get('received_at')).toISOString(),
    temperature_c:Number(data.get('temperature_c')), event_reference:data.get('event_reference')
  };
  try { await apiFetch('/components/receive',{method:'POST',body:JSON.stringify(payload)}); closeModal(); await reloadComponents(); render(); toast(tr('success.title'),tr('components.received')); }
  catch(error){ toast(tr('error.title'),friendlyError(error),'warning'); }
}

async function saveComponentPolicy() {
  const form = document.querySelector('#component-policy-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form); const num = name => data.get(name) === '' ? null : Number(data.get(name));
  const policy = { component_type:data.get('component_type'), shelf_life_hours:num('shelf_life_hours'), minimum_temperature_c:num('minimum_temperature_c'), maximum_temperature_c:num('maximum_temperature_c'), policy_reference:data.get('policy_reference'), active:true };
  try { await apiFetch('/components/policies/mine',{method:'PUT',body:JSON.stringify({policies:[policy],authorized_confirmation:data.has('authorized_confirmation')})}); closeModal(); await reloadComponents(); render(); toast(tr('success.title'),tr('components.policySaved')); }
  catch(error){ toast(tr('error.title'),friendlyError(error),'warning'); }
}

async function saveComponentEvent() {
  const form = document.querySelector('#component-event-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = { event_type:data.get('event_type'), occurred_at:new Date(data.get('occurred_at')).toISOString(), event_reference:data.get('event_reference'), temperature_c:data.get('temperature_c') === '' ? null : Number(data.get('temperature_c')), authorized_confirmation:data.has('authorized_confirmation'), note:data.get('note') };
  try { await apiFetch(`/components/${form.dataset.componentId}/events`,{method:'POST',body:JSON.stringify(payload)}); closeModal(); await reloadComponents(); render(); toast(tr('success.title'),tr('components.eventSaved')); }
  catch(error){ toast(tr('error.title'),friendlyError(error),'warning'); }
}

async function saveComponentSplit() {
  const form = document.querySelector('#component-split-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form); const components = [];
  for (let index=1; index<=3; index += 1) {
    const reference = String(data.get(`reference_${index}`) || '').trim(); if (!reference) continue;
    components.push({ component_reference:reference, isbt128_code:String(data.get(`isbt_${index}`) || '').trim() || null, component_type:data.get(`type_${index}`), volume_ml:data.get(`volume_${index}`) ? Number(data.get(`volume_${index}`)) : null });
  }
  const payload = { prepared_at:new Date(data.get('prepared_at')).toISOString(), components, sop_confirmation:data.has('sop_confirmation') };
  try { await apiFetch(`/components/${form.dataset.componentId}/split`,{method:'POST',body:JSON.stringify(payload)}); closeModal(); await reloadComponents(); render(); toast(tr('success.title'),tr('components.separated')); }
  catch(error){ toast(tr('error.title'),friendlyError(error),'warning'); }
}

async function saveHandover() {
  const form = document.querySelector('#handover-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = { component_id:form.dataset.componentId, to_hospital_id:data.get('to_hospital_id'), handed_over_at:new Date(data.get('handed_over_at')).toISOString(), dispatch_temperature_c:Number(data.get('dispatch_temperature_c')), container_reference:data.get('container_reference'), notes:data.get('notes') };
  try { await apiFetch('/components/handovers',{method:'POST',body:JSON.stringify(payload)}); closeModal(); await reloadComponents(); render(); toast(tr('success.title'),tr('components.handoverSaved')); }
  catch(error){ toast(tr('error.title'),friendlyError(error),'warning'); }
}

async function saveHandoverReceipt() {
  const form = document.querySelector('#handover-receive-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = { received_at:new Date(data.get('received_at')).toISOString(), receipt_temperature_c:Number(data.get('receipt_temperature_c')), receipt_confirmation:data.has('receipt_confirmation'), notes:data.get('notes') };
  try { await apiFetch(`/components/handovers/${form.dataset.handoverId}/receive`,{method:'POST',body:JSON.stringify(payload)}); closeModal(); await reloadComponents(); render(); toast(tr('success.title'),tr('components.receiptSaved')); }
  catch(error){ toast(tr('error.title'),friendlyError(error),'warning'); }
}

async function saveRequest() {
  const form = document.querySelector('#request-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form); const file = data.get('slip');
  try {
    const upload = new FormData(); upload.append('upload', file);
    const documentRef = await apiFetch('/requests/documents', { method:'POST', body:upload });
    const payload = { patient_reference:data.get('patient_reference'), blood_type:data.get('blood_type'), phenotype_code:null, component_type:data.get('component_type'), units_needed:Number(data.get('units_needed')), urgency:data.get('urgency'), expires_in_hours:Number(data.get('expires_in_hours')), latitude:null, longitude:null, document_object_key:documentRef.object_key, document_sha256_hex:documentRef.sha256 };
    await apiFetch('/requests', { method:'POST', body:JSON.stringify(payload) }); closeModal(); state.hospitalRequests = await apiFetch('/requests/mine'); render(); toast(tr('success.title'), tr('success.requestCreated'));
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function openPass() {
  try {
    state.profile = await apiFetch('/donors/me/profile');
    let issued = await apiFetch('/donors/me/pass');
    openModal({
      title: tr('donor.passTitle'), subtitle: tr('donor.passSafety'),
      body: `<div class="qr-pass"><div class="qr-brand">${icon('activity','icon-sm')} RaktFlow <span class="live-indicator"><i></i>${esc(tr('pass.live'))}</span></div><div class="qr-frame live"><canvas id="donor-pass-canvas"></canvas><div class="qr-countdown">${esc(tr('pass.validFor'))} —</div></div><div class="rotating-code">${esc(issued.rotating_code.slice(0,3))} ${esc(issued.rotating_code.slice(3))}</div><div class="manual-pass-reference"><span>${esc(tr('donor.manualReference'))}</span><strong>${esc(state.profile?.reference_code || '')}</strong></div><div class="secure-note">${icon('lock','icon-sm')} ${esc(tr('donor.qrOpaque'))}</div></div>`,
      footer: `<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.close'))}</button>`,
      onOpen: () => {
        let stopped = false;
        let nextRefreshAt = 0;
        const canvas = () => document.querySelector('#donor-pass-canvas');
        const countdown = () => document.querySelector('.qr-countdown');
        const draw = async payload => {
          const node = canvas(); if (!node || stopped) return;
          node.width = 480; node.height = 480;
          await QRCode.toCanvas(node, payload.token, { width:480, margin:2, errorCorrectionLevel:'M', color:{dark:'#0f172a',light:'#ffffff'} });
          nextRefreshAt = new Date(payload.expires_at).getTime() - 20000;
          issued = payload;
        };
        const tick = async () => {
          if (stopped) return;
          const remaining = Math.max(0, Math.floor((new Date(issued.expires_at).getTime() - Date.now()) / 1000));
          const label = countdown(); if (label) label.textContent = `${tr('pass.validFor')} ${remaining}s`;
          if (Date.now() >= nextRefreshAt) {
            try { await draw(await apiFetch('/donors/me/pass')); } catch { /* previous token still accepted */ }
          }
        };
        draw(issued);
        const timer = setInterval(tick, 1000);
        return () => { stopped = true; clearInterval(timer); };
      }
    });
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function registerDrive(driveId, campaignId = null) {
  if (!state.profile) { toast(tr('error.title'), tr('error.profileRequired'), 'warning'); profileModal(); return; }
  try {
    await apiFetch(`/drives/${driveId}/registrations`, { method:'POST', body:JSON.stringify({ campaign_id:campaignId }) });
    state.registrations = await apiFetch('/drives/registrations/mine'); render(); toast(tr('success.title'), tr('success.registered'));
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function processQrToken(token, opts = {}) {
  if (!state.activeDriveId) { toast(tr('error.title'), tr('intake.selectDrive'), 'warning'); return false; }
  try {
    state.intakeDonor = await apiFetch('/intake/scan', { method:'POST', body:JSON.stringify({ drive_id:state.activeDriveId, pass_token:token, idempotency_key:crypto.randomUUID() }) });
    stopInlineScanner(); await loadActiveDriveData(); render(); toast(tr('success.title'), tr('success.checkedIn'));
    return true;
  } catch (error) {
    const message = friendlyError(error);
    if (!opts.fromScanner) toast(tr('error.title'), message, 'warning');
    else setScannerStatus(message, true);
    return false;
  }
}

let inlineScannerCleanup = null;

function setScannerStatus(message, error = false) {
  const status = document.querySelector('#scanner-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', error);
}

function stopInlineScanner() {
  inlineScannerCleanup?.(); inlineScannerCleanup = null;
  const video = document.querySelector('#qr-video');
  if (video) video.srcObject = null;
  const startBtn = document.querySelector('[data-action="start-camera"]');
  const stopBtn = document.querySelector('[data-action="stop-camera"]');
  if (startBtn) startBtn.hidden = false;
  if (stopBtn) stopBtn.hidden = true;
  setScannerStatus(tr('intake.cameraIdle'));
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { toast(tr('error.title'), tr('intake.secureCamera'), 'warning'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false }); }
  catch (error) { console.warn(error); toast(tr('error.title'), tr('intake.cameraPermission'), 'warning'); return; }
  const video = document.querySelector('#qr-video');
  if (!video) { stream.getTracks().forEach(track => track.stop()); return; }
  const startBtn = document.querySelector('[data-action="start-camera"]');
  const stopBtn = document.querySelector('[data-action="stop-camera"]');
  if (startBtn) startBtn.hidden = true;
  if (stopBtn) stopBtn.hidden = false;
  video.srcObject = stream; video.play().catch(() => null);
  setScannerStatus(tr('intake.holdQr'));
  const { BrowserQRCodeReader, DecodeHintType } = await import('@zxing/browser');
  const reader = new BrowserQRCodeReader(new Map([[DecodeHintType.TRY_HARDER, true]]), { delayBetweenScanAttempts: 250 });
  let done = false;
  try {
    const controls = await reader.decodeFromStream(stream, video, async result => {
      if (!result || done) return;
      setScannerStatus(tr('intake.codeFound'));
      const accepted = await processQrToken(result.getText(), { fromScanner:true });
      if (accepted) { done = true; stopInlineScanner(); }
      else { setScannerStatus(tr('intake.scanRetry'), true); }
    });
    inlineScannerCleanup = () => { done = true; controls.stop(); stream.getTracks().forEach(track => track.stop()); };
  } catch (error) { console.warn(error); setScannerStatus(tr('intake.noQrFound'), true); stopInlineScanner(); }
}

async function scanQrImage(file) {
  if (!file) return;
  const { BrowserQRCodeReader } = await import('@zxing/browser');
  const url = URL.createObjectURL(file);
  try {
    const { DecodeHintType } = await import('@zxing/browser');
    const result = await new BrowserQRCodeReader(new Map([[DecodeHintType.TRY_HARDER, true]])).decodeFromImageUrl(url);
    await processQrToken(result.getText());
  } catch (error) { console.warn(error); toast(tr('error.title'), tr('intake.noQrFound'), 'warning'); }
  finally { URL.revokeObjectURL(url); }
}

async function startUnitCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { toast(tr('error.title'),tr('intake.secureCamera'),'warning'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}); }
  catch(error){ console.warn(error); toast(tr('error.title'),tr('intake.cameraPermission'),'warning'); return; }
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  openModal({
    title:tr('components.scanExisting'), subtitle:tr('components.scanExistingHelp'),
    body:`<video id="unit-video" class="qr-video" playsinline muted></video><p class="muted">${esc(tr('components.noCertifiedGeneration'))}</p>`,
    footer:`<button class="btn btn-secondary" data-action="close-modal">${esc(tr('common.cancel'))}</button>`,
    onOpen:() => {
      const video=document.querySelector('#unit-video'); video.srcObject=stream; video.play().catch(()=>null);
      const reader=new BrowserMultiFormatReader(); let controls; let done=false;
      reader.decodeFromStream(stream,video,result=>{ if(result && !done){ done=true; controls?.stop(); stream.getTracks().forEach(track=>track.stop()); receiveComponentModal(result.getText()); } }).then(value=>{controls=value;}).catch(error=>{console.warn(error);toast(tr('error.title'),tr('components.noCodeFound'),'warning');});
      return ()=>{done=true;controls?.stop();stream.getTracks().forEach(track=>track.stop());reader.reset?.();};
    }
  });
}

async function scanUnitImage(file) {
  if (!file) return;
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const url=URL.createObjectURL(file);
  try { const result=await new BrowserMultiFormatReader().decodeFromImageUrl(url); receiveComponentModal(result.getText()); }
  catch(error){console.warn(error);toast(tr('error.title'),tr('components.noCodeFound'),'warning');}
  finally{URL.revokeObjectURL(url);}
}

async function manualCheckin() {
  const donorReference = document.querySelector('#manual-reference')?.value.trim().toUpperCase();
  if (!donorReference) return;
  try {
    state.intakeDonor = await withBackendReady(() => apiFetch('/intake/manual', { method:'POST', body:JSON.stringify({ drive_id:state.activeDriveId, donor_reference:donorReference, idempotency_key:crypto.randomUUID() }) }));
    await loadActiveDriveData(); render(); toast(tr('success.title'), tr('success.checkedIn'));
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function saveAssessment() {
  const form = document.querySelector('#assessment-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form); const num = name => data.get(name) ? Number(data.get(name)) : null;
  const payload = { decision:data.get('decision'), reason_codes:String(data.get('reason_codes') || '').split(',').map(value => value.trim()).filter(Boolean), hemoglobin_g_dl:num('hemoglobin_g_dl'), pulse_bpm:num('pulse_bpm'), systolic_bp:num('systolic_bp'), diastolic_bp:num('diastolic_bp') };
  try { await withBackendReady(() => apiFetch(`/intake/${state.intakeDonor.checkin_id}/assessment`, { method:'POST', body:JSON.stringify(payload) })); state.intakeDonor.clearance_status = payload.decision; closeModal(); await loadActiveDriveData(); render(); toast(tr('success.title'), tr('success.assessmentSaved')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function saveDonation() {
  const form = document.querySelector('#donation-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = { unit_reference:data.get('unit_reference'), component_type:data.get('component_type'), blood_type_at_collection:data.get('blood_type_at_collection'), volume_ml:Number(data.get('volume_ml')), collected_at:new Date().toISOString() };
  try { await withBackendReady(() => apiFetch(`/intake/${state.intakeDonor.checkin_id}/donation`, { method:'POST', body:JSON.stringify(payload) })); closeModal(); await loadActiveDriveData(); render(); toast(tr('success.title'), tr('success.donationSaved')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function saveReview() {
  const form = document.querySelector('#review-form'); if (!form?.reportValidity()) return;
  try { await withBackendReady(() => apiFetch(`/clinical/screenings/${form.dataset.screeningId}/decision`, { method:'POST', body:JSON.stringify({ decision:form.dataset.decision, note:new FormData(form).get('note') }) })); closeModal(); state.clinicalQueue = await apiFetch('/clinical/screenings?review_status=ALL'); render(); toast(tr('success.title'), tr('success.reviewSaved')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function sendInvite() {
  const form = document.querySelector('#invite-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form); const roles = data.getAll('roles');
  if (!roles.length) { toast(tr('error.title'), tr('admin.chooseRole'), 'warning'); return; }
  try { const result = await apiFetch('/admin/invitations', { method:'POST', body:JSON.stringify({ email:data.get('email'), roles }) }); closeModal(); state.invitations = await apiFetch('/admin/invitations'); render(); toast(tr('success.title'), result.delivery === 'SENT' ? tr('success.inviteSent') : tr('success.inviteRecorded')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}


async function resendInvitation(invitationId) {
  try {
    const result = await apiFetch(`/admin/invitations/${invitationId}/resend`, { method:'POST' });
    state.invitations = await apiFetch('/admin/invitations');
    render();
    toast(tr('success.title'), result.delivery === 'SENT' ? tr('success.inviteSent') : tr('success.inviteRecorded'));
  } catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function saveRoles() {
  const form = document.querySelector('#roles-form'); const data = new FormData(form); const roles = data.getAll('roles');
  if (!roles.length) return;
  try { await apiFetch(`/admin/users/${form.dataset.userId}/roles`, { method:'PUT', body:JSON.stringify({ roles }) }); closeModal(); state.adminUsers = await apiFetch('/admin/users'); render(); toast(tr('success.title'), tr('success.rolesSaved')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function decideProposal(id, decision) {
  const note = window.prompt(tr('common.note'), '') ?? '';
  try { await apiFetch(`/drives/proposals/${id}/decision`, { method:'POST', body:JSON.stringify({ decision, note }) }); state.proposals = await apiFetch('/drives/proposals/mine'); render(); toast(tr('success.title'), tr('success.decisionSaved')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function decideHospital(id, decision) {
  const note = window.prompt(tr('common.note'), '') ?? '';
  try { await apiFetch(`/hospitals/${id}/verification`, { method:'POST', body:JSON.stringify({ decision, note }) }); state.hospitalApplications = await apiFetch('/hospitals/applications'); render(); toast(tr('success.title'), tr('success.decisionSaved')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function updateDriveStatus(id, nextStatus) {
  try { await withBackendReady(() => apiFetch(`/drives/${id}/status`, { method:'PATCH', body:JSON.stringify({ status:nextStatus }) })); state.drives = await apiFetch('/drives/mine'); state.activeDriveId = id; await loadActiveDriveData(); render(); toast(tr('success.title'), tr('success.driveUpdated')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function verifyRequest() {
  const form = document.querySelector('#request-review-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const payload = {
    decision:'VERIFIED', reason_code:'AUTHORIZED_DOCUMENT_REVIEW',
    physician_registration_confirmed:data.has('physician_registration_confirmed'),
    component_confirmed:data.has('component_confirmed'),
    document_review_confirmed:data.has('document_review_confirmed'),
    ocr_mismatch_resolved:data.has('ocr_mismatch_resolved'),
    review_note:data.get('review_note')
  };
  try { await apiFetch(`/requests/${form.dataset.requestId}/verify`, { method:'POST', body:JSON.stringify(payload) }); closeModal(); state.hospitalRequests = await apiFetch('/requests/mine'); render(); toast(tr('success.title'), tr('success.requestVerified')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

async function publishCampaign(id) {
  try { await apiFetch(`/campaigns/${id}`, { method:'PATCH', body:JSON.stringify({ status:'PUBLISHED' }) }); state.campaigns = await apiFetch('/campaigns/mine'); render(); toast(tr('success.title'), tr('success.campaignPublished')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

function campaignById(id) { return state.campaigns.find(item => item.id === id); }

async function copyCampaignLink(id) {
  const campaign = campaignById(id); if (!campaign) return;
  try { await navigator.clipboard.writeText(campaign.registration_url); toast(tr('success.title'), tr('success.linkCopied')); }
  catch { toast(tr('error.title'), tr('error.clipboard'), 'warning'); }
}

async function downloadCampaignQr(id) {
  const campaign = campaignById(id); if (!campaign) return;
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, campaign.registration_url, { width:800, margin:3, errorCorrectionLevel:'H' });
  canvas.toBlob(blob => { if (!blob) return; const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${campaign.slug}-registration-qr.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href),1000); });
}

function posterSvg(campaign) {
  const p = campaign.poster || {}; const drive = campaign.drive;
  const safe = value => esc(value).replaceAll('&#39;', '&apos;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#1e293b"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><circle cx="920" cy="170" r="260" fill="${safe(p.accent_color || '#e11d48')}" opacity=".22"/><path d="M160 180c0 95-130 160-130 260a130 130 0 0 0 260 0c0-100-130-260-130-260Z" transform="translate(40 35) scale(.55)" fill="${safe(p.accent_color || '#e11d48')}"/><text x="90" y="105" fill="white" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="42" font-weight="800">RaktFlow × ${safe(p.organizer_name || '')}</text><text x="90" y="610" fill="#fda4af" font-family="sans-serif" font-size="30" font-weight="800">VERIFIED COMMUNITY DRIVE</text><foreignObject x="90" y="650" width="900" height="260"><div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font:800 76px/1.06 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${safe(p.headline || campaign.title)}</div></foreignObject><text x="90" y="970" fill="#cbd5e1" font-family="sans-serif" font-size="34">${safe(fmtDate(drive.starts_at))}</text><text x="90" y="1025" fill="#cbd5e1" font-family="sans-serif" font-size="34">${safe(drive.venue_name || drive.address)}</text><rect x="90" y="1110" width="420" height="92" rx="20" fill="${safe(p.accent_color || '#e11d48')}"/><text x="300" y="1169" text-anchor="middle" fill="white" font-family="sans-serif" font-size="30" font-weight="800">${safe(p.call_to_action || 'Register securely')}</text><text x="90" y="1280" fill="#94a3b8" font-family="sans-serif" font-size="24">Registration is not medical clearance.</text></svg>`;
}

function downloadPoster(id) {
  const campaign = campaignById(id); if (!campaign) return;
  const blob = new Blob([posterSvg(campaign)], { type:'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${campaign.slug}-poster.svg`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href),1000);
}

async function sendCampaignEmail() {
  const form = document.querySelector('#campaign-email-form'); if (!form?.reportValidity()) return;
  const data = new FormData(form);
  try { const result = await apiFetch(`/campaigns/${form.dataset.campaignId}/share`, { method:'POST', body:JSON.stringify({ recipient_email:data.get('recipient_email'), personal_message:data.get('personal_message') }) }); closeModal(); toast(tr('success.title'), result.delivery === 'SENT' ? tr('success.emailSent') : tr('success.emailRecorded')); }
  catch (error) { toast(tr('error.title'), friendlyError(error), 'warning'); }
}

app.addEventListener('change', async event => {
  const language = event.target.closest('select[data-action="change-language"]');
  if (language) {
    state.locale = await loadLocale(language.value); setLocale(state.locale);
    state.preferences = { ...(state.preferences || {}), language: state.locale };
    render();
    if (state.account) await savePreferences(true);
    return;
  }
  const drive = event.target.closest('select[data-action="select-drive"]');
  if (drive) { state.activeDriveId = drive.value; await loadActiveDriveData(); render(); return; }
});

app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action],[data-view],[data-role]'); if (!target) return;
  const { action, view, role } = target.dataset;
  if (view) { state.view=view; state.mobileMenu=false; render(); return; }
  if (role) { state.role=role; state.view=roleConfig[role].landing; state.roleMenu=false; storage.setItem('raktflow-role',role); render(); return; }
  if (action === 'open-signin') return authModal('signin');
  if (action === 'open-register' || action === 'campaign-register') return authModal('register');
  if (action === 'retry-bootstrap') return state.authUser ? bootstrapSession(state.authUser) : authModal('signin');
  if (action === 'sign-out') { closeModal(); await signOutUser(); state.account=null; state.profile=null; state.screen='landing'; state.authError=''; render(); return; }
  if (action === 'toggle-mobile-menu') { state.mobileMenu=!state.mobileMenu; render(); return; }
  if (action === 'toggle-role-menu') { state.roleMenu=!state.roleMenu; render(); return; }
  if (action === 'toggle-theme') {
    applyAppearance(state.theme === 'dark' ? 'LIGHT' : 'DARK'); render(); await savePreferences(true); return;
  }
  if (action === 'set-theme') { applyAppearance(target.dataset.theme === 'dark' ? 'DARK' : 'LIGHT'); render(); return; }
  if (action === 'set-appearance') { applyAppearance(target.dataset.appearance); render(); return; }
  if (action === 'save-preferences') return savePreferences();
  if (action === 'download-personal-data') return downloadPersonalData();
  if (action === 'privacy-request') return privacyRequestModal();
  if (action === 'privacy-decision') return decidePrivacyRequest(target.dataset.requestId,target.dataset.status);
  if (action === 'open-settings' || action === 'enable-local-alerts') { state.view='settings'; state.mobileMenu=false; render(); return; }
  if (action === 'open-account') return accountModal();
  if (action === 'open-profile') { closeModal(); return profileModal(); }
  if (action === 'open-screening') return screeningModal();
  if (action === 'open-pass') return openPass();
  if (action === 'go-drives') { state.view='drives'; render(); return; }
  if (action === 'refresh-donor' || action === 'refresh-hospital' || action === 'refresh-admin' || action === 'refresh-clinical' || action === 'refresh-proposals') return refreshCurrent();
  if (action === 'refresh-eligibility') return refreshEligibility();
  if (action === 'read-unit-notification') return readUnitNotification(target.dataset.notificationId);
  if (action === 'respond-rare-alert') return respondRareAlert(target.dataset.alertId,target.dataset.response);
  if (action === 'start-rare-dispatch') return updateRareDispatch(target.dataset.requestId);
  if (action === 'expand-rare-dispatch') return updateRareDispatch(target.dataset.requestId,true);
  if (action === 'register-drive') return registerDrive(target.dataset.driveId);
  if (action === 'register-campaign') return registerDrive(state.campaignLanding.drive.id, state.campaignLanding.id);
  if (action === 'create-drive') return driveModal();
  if (action === 'create-proposal') return proposalModal();
  if (action === 'manage-quotas') {
    state.activeDriveId = target.dataset.driveId; await loadActiveDriveData(); return quotaModal();
  }
  if (action === 'create-campaign') return campaignModal();
  if (action === 'edit-campaign') return campaignModal(campaignById(target.dataset.campaignId));
  if (action === 'select-campaign') { state.selectedCampaignId = target.dataset.campaignId; render(); return; }
  if (action === 'publish-campaign') return publishCampaign(target.dataset.campaignId);
  if (action === 'copy-campaign-link') return copyCampaignLink(target.dataset.campaignId);
  if (action === 'download-campaign-qr') return downloadCampaignQr(target.dataset.campaignId);
  if (action === 'download-poster') return downloadPoster(target.dataset.campaignId);
  if (action === 'email-campaign') return campaignEmailModal(target.dataset.campaignId);
  if (action === 'select-drive-card') { state.activeDriveId=target.dataset.driveId; state.view='overview'; await loadActiveDriveData(); render(); return; }
  if (action === 'select-drive-roster') { state.activeDriveId=target.dataset.driveId; state.view='roster'; await loadActiveDriveData(); render(); return; }
  if (action === 'select-drive-report') { state.activeDriveId=target.dataset.driveId; state.view='reconcile'; await loadActiveDriveData(); render(); return; }
  if (action === 'stop-camera') { stopInlineScanner(); return; }
  if (action === 'drive-status') return updateDriveStatus(target.dataset.driveId, target.dataset.status);
  if (action === 'start-camera') return startCamera();
  if (action === 'manual-checkin') return manualCheckin();
  if (action === 'clinical-assessment') return assessmentModal();
  if (action === 'record-donation') return donationModal();
  if (action === 'apply-hospital') { closeModal(); return hospitalApplicationModal(); }
  if (action === 'upload-hospital-evidence') return hospitalEvidenceModal(target.dataset.hospitalId);
  if (action === 'review-hospital-documents') return hospitalDocumentsModal(target.dataset.hospitalId);
  if (action === 'inventory-event') return inventoryModal();
  if (action === 'receive-component') return receiveComponentModal();
  if (action === 'component-policies') return componentPolicyModal();
  if (action === 'component-event') return componentEventModal(target.dataset.componentId);
  if (action === 'component-history') return componentHistoryModal(target.dataset.componentId);
  if (action === 'split-component') return splitComponentModal(target.dataset.componentId);
  if (action === 'handover-component') return handoverModal(target.dataset.componentId);
  if (action === 'receive-handover') return receiveHandoverModal(target.dataset.handoverId);
  if (action === 'new-request') return requestModal();
  if (action === 'review-request') return requestReviewModal(target.dataset.requestId);
  if (action === 'review-screening') return reviewDecisionModal(target.dataset.screeningId,target.dataset.decision);
  if (action === 'invite-user') return inviteModal();
  if (action === 'resend-invitation') return resendInvitation(target.dataset.invitationId);
  if (action === 'edit-roles') return rolesModal(target.dataset.userId);
  if (action === 'toggle-user') { try { await apiFetch(`/admin/users/${target.dataset.userId}/status?active=${target.dataset.active}`,{method:'PATCH'}); state.adminUsers=await apiFetch('/admin/users'); render(); } catch(error){toast(tr('error.title'),friendlyError(error),'warning');} return; }
  if (action === 'hospital-decision') return decideHospital(target.dataset.hospitalId,target.dataset.decision);
  if (action === 'proposal-decision') return decideProposal(target.dataset.proposalId,target.dataset.decision);
});

modalRoot.addEventListener('submit', async event => {
  event.preventDefault();
  if (event.target.id === 'auth-signin-form') await submitAuth(event.target,'signin');
  if (event.target.id === 'auth-register-form') await submitAuth(event.target,'register');
  if (event.target.id === 'auth-reset-form') await submitAuth(event.target,'reset');
});

modalRoot.addEventListener('click', async event => {
  if (event.target.classList.contains('modal-backdrop')) { closeModal(); return; }
  const target = event.target.closest('[data-action]'); if (!target) return;
  const { action } = target.dataset;
  if (action === 'close-modal') return closeModal();
  if (action === 'show-reset') { const email=document.querySelector('#auth-signin-form [name=email]')?.value || ''; return authModal('reset',email); }
  if (action === 'show-signin') return authModal('signin');
  if (action === 'show-register') return authModal('register');
  if (action === 'google-signin') { try { state.screen='loading';state.loadingKey='loading.signingIn';closeModal();render();await signInWithGoogle(); } catch(error){state.screen='landing';render();toast('Google sign-in failed',authErrorMessage(error),'warning');} return; }
  if (action === 'sign-out') { closeModal(); await signOutUser(); state.screen='landing';state.account=null;render();return; }
  if (action === 'open-profile') { closeModal(); return profileModal(); }
  if (action === 'apply-hospital') { closeModal(); return hospitalApplicationModal(); }
  if (action === 'upload-hospital-evidence') return hospitalEvidenceModal(target.dataset.hospitalId);
  if (action === 'save-profile') return saveProfile();
  if (action === 'save-privacy-request') return savePrivacyRequest();
  if (action === 'submit-screening') return saveScreening();
  if (action === 'save-drive') return saveDrive();
  if (action === 'save-quotas') return saveQuotas();
  if (action === 'save-proposal') return saveProposal();
  if (action === 'save-campaign') return saveCampaign();
  if (action === 'submit-hospital') return submitHospital();
  if (action === 'save-hospital-evidence') return saveHospitalEvidence();
  if (action === 'download-hospital-document') return downloadHospitalDocument(target.dataset.hospitalId, target.dataset.documentId, target.dataset.filename);
  if (action === 'save-inventory') return saveInventory();
  if (action === 'start-unit-camera') return startUnitCamera();
  if (action === 'save-component-receipt') return saveComponentReceipt();
  if (action === 'save-component-policy') return saveComponentPolicy();
  if (action === 'save-component-event') return saveComponentEvent();
  if (action === 'save-component-split') return saveComponentSplit();
  if (action === 'save-handover') return saveHandover();
  if (action === 'save-handover-receipt') return saveHandoverReceipt();
  if (action === 'save-request') return saveRequest();
  if (action === 'save-request-review') return verifyRequest();
  if (action === 'send-invite') return sendInvite();
  if (action === 'save-roles') return saveRoles();
  if (action === 'save-review') return saveReview();
  if (action === 'save-assessment') return saveAssessment();
  if (action === 'save-donation') return saveDonation();
  if (action === 'send-campaign-email') return sendCampaignEmail();
  if (['fill-location','fill-profile-location','fill-drive-location','fill-proposal-location'].includes(action)) {
    const formId = { 'fill-location':'hospital-form', 'fill-profile-location':'profile-form', 'fill-drive-location':'drive-form', 'fill-proposal-location':'proposal-form' }[action];
    navigator.geolocation?.getCurrentPosition(position => {
      const form = document.querySelector(`#${formId}`);
      form.elements.latitude.value = position.coords.latitude.toFixed(6);
      form.elements.longitude.value = position.coords.longitude.toFixed(6);
      if (formId === 'profile-form') {
        const status = form.querySelector('#profile-location-status');
        if (status) status.textContent = tr('profile.locationCapturedEphemeral');
      }
    }, () => toast(tr('error.title'), tr('error.location'), 'warning'), { enableHighAccuracy:true, timeout:12000, maximumAge:300000 });
  }
});

document.addEventListener('change', event => {
  if (event.target.id === 'qr-image-input') scanQrImage(event.target.files?.[0]);
  if (event.target.id === 'unit-barcode-image') scanUnitImage(event.target.files?.[0]);
});

window.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
window.addEventListener('online', () => { state.online=true; render(); toast(tr('success.title'),tr('success.online')); });
window.addEventListener('offline', () => { state.online=false; render(); toast(tr('error.title'),tr('error.offline'),'warning'); });

if (import.meta.env.PROD) registerServiceWorker(() => toast(tr('success.title'),tr('success.updateReady')));

// A free Render service sleeps after idle; waking it as soon as the user
// returns to a backgrounded tab removes the "could not reach" first-tap race.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) prewarmApi();
});

(async function initialize() {
  state.locale = await loadLocale(state.locale);
  setLocale(state.locale);
  render();
  prewarmApi();
  await loadPublicData();
  render();
  if (!isAuthConfigured()) return;
  try { await completeGoogleRedirect(); }
  catch (error) {
    state.screen = 'landing'; render();
    toast('Google sign-in did not finish', authErrorMessage(error), 'warning');
  }
  if (location.href.includes('mode=signIn')) {
    try { await completeLegacyMagicLink(); }
    catch (error) { console.warn(error); }
  }
  let bootstrappingUid = null;
  observeAuth(async user => {
    if (!user) {
      bootstrappingUid = null;
      if (state.screen !== 'landing') { state.screen='landing';state.account=null;state.authUser=null;render(); }
      return;
    }
    if (!user.emailVerified) { state.screen='landing';state.authUser=null;render();return; }
    if (bootstrappingUid === user.uid && state.account) return;
    bootstrappingUid = user.uid;
    await bootstrapSession(user);
  });
})();
