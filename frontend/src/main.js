import './styles.css';
import QRCode from 'qrcode';
import { apiFetch, isApiConfigured, prewarmApi, publicApiFetch } from './api.js';
import { completeMagicLink, isAuthConfigured, observeAuth, sendMagicLink, signInWithGoogle, signOutUser } from './auth.js';
import { registerServiceWorker } from './register-sw.js';
import { applyTranslations, getLocale, languages, setLocale, t } from './i18n.js';

const icons = {
  home: '<path d="M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 19.8Z"/><path d="M9 21v-7h6v7"/>',
  droplet: '<path d="M12 2.7S5.5 10 5.5 15a6.5 6.5 0 0 0 13 0c0-5-6.5-12.3-6.5-12.3Z"/><path d="M9 16.5c.5 1.2 1.4 1.8 2.8 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  alert: '<path d="M10.3 3.5 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.5a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h1M20 14h1"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  activity: '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
  certificate: '<path d="M6 3h12v11a6 6 0 0 1-12 0Z"/><path d="M9 20v2l3-1 3 1v-2M9 8h6M9 11h6"/>',
  hospital: '<path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M2 21h20M17 9h3a1 1 0 0 1 1 1v11M8 8h5M10.5 5.5v5M8 14h2M13 14h1M8 18h2M13 18h1"/>',
  inventory: '<path d="M4 7h16v14H4zM2 3h20v4H2zM9 11h6"/>',
  ambulance: '<path d="M3 6h11v12H3zM14 10h4l3 3v5h-7M7 9v6M4 12h6"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
  pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1M10 21v-3h4v3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  moon: '<path d="M21 12.8A8.8 8.8 0 1 1 11.2 3 6.8 6.8 0 0 0 21 12.8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0"/>',
  wifiOff: '<path d="m2 2 20 20M8.5 16a5 5 0 0 1 4.7-1.3M5 12.5a10 10 0 0 1 3.4-2.1M2 9a15 15 0 0 1 3.7-2.2M14.4 5.2A15 15 0 0 1 22 9M18.8 12.3l.2.2M12 20h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  route: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19h3a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3h1"/>',
  syringe: '<path d="m18 2 4 4M17 7l2-2M5 19l9-9M3 21l3-1-2-2-1 3ZM9 8l7 7M7 10l7 7"/>',
  userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 11l2 2 4-4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h6"/>',
  truck: '<path d="M3 6h11v12H3zM14 10h4l3 3v5h-7"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
  navigation: '<path d="m3 11 19-8-8 19-2-8-9-3Z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
  refresh: '<path d="M20 7h-5V2M4 17h5v5M19 12a7 7 0 0 0-12-5l-2 2M5 12a7 7 0 0 0 12 5l2-2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
};

function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.droplet}</svg>`;
}

const roleConfig = {
  donor: {
    label: 'Donor Portal', short: 'Donor', org: 'Individual donor', icon: 'droplet',
    landing: 'home',
    nav: [
      ['home', 'Overview', 'home'], ['drives', 'Nearby drives', 'calendar'], ['emergencies', 'Emergency calls', 'alert'], ['history', 'Donation history', 'certificate'], ['resources', 'India resources', 'hospital'], ['pass', 'Digital pass', 'qr']
    ]
  },
  organizer: {
    label: 'Organizer Command', short: 'Organizer', org: 'Red Cross — Visakhapatnam', icon: 'users',
    landing: 'command',
    nav: [
      ['command', 'Command center', 'activity'], ['scanner', 'QR intake', 'scan'], ['donors', 'Donor register', 'users'], ['certificates', 'Certificates', 'certificate']
    ]
  },
  hospital: {
    label: 'Hospital Console', short: 'Hospital', org: 'District General Hospital', icon: 'hospital',
    landing: 'operations',
    nav: [
      ['operations', 'Operations', 'activity'], ['inventory', 'Blood inventory', 'inventory'], ['requisitions', 'Requisitions', 'file'], ['maternity', 'Maternity bridge', 'ambulance']
    ]
  },
  venue: {
    label: 'Host Venue Portal', short: 'Host venue', org: 'Host institution', icon: 'building',
    claim: 'ROLE_HOST_VENUE', landing: 'proposals',
    nav: [
      ['proposals', 'Drive proposals', 'calendar'], ['campaign', 'Campaign builder', 'link'], ['impact', 'Impact & ESG', 'chart'], ['logistics', 'Venue logistics', 'briefcase']
    ]
  },
  admin: {
    label: 'Access Administration', short: 'Super Admin', org: 'RaktFlow control plane', icon: 'shield',
    claim: 'ROLE_SUPER_ADMIN', landing: 'access',
    nav: [
      ['access', 'Access control', 'shield'], ['hospitals', 'Hospital verification', 'hospital'], ['driveApprovals', 'Drive approvals', 'calendar'], ['invitations', 'Invitations', 'mail'], ['audit', 'Audit trail', 'activity'], ['platform', 'Platform health', 'settings']
    ]
  }
};
roleConfig.donor.claim = 'ROLE_DONOR';
roleConfig.organizer.claim = 'ROLE_ORGANIZER';
roleConfig.hospital.claim = 'ROLE_HOSPITAL';

const storage = (() => {
  try {
    localStorage.setItem('__raktflow_storage_test__', '1');
    localStorage.removeItem('__raktflow_storage_test__');
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
})();

const state = {
  screen: 'landing',
  role: storage.getItem('raktflow-role') || 'donor',
  locale: getLocale(),
  view: '',
  theme: storage.getItem('raktflow-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  authenticated: false,
  authUser: null,
  demoMode: false,
  allowedRoles: [],
  account: null,
  donorProfile: null,
  publicStats: null,
  publicRequests: [],
  knownRequestIds: new Set(),
  publicCentres: [],
  publicDrives: [],
  donorAlerts: [],
  donationHistory: [],
  adminUsers: [],
  invitations: [],
  hospitalApplications: [],
  adminDrives: [],
  hospitalProfile: null,
  hospitalInventory: [],
  hospitalRequests: [],
  proposals: [],
  driveAnalytics: null,
  drives: [],
  activeDriveId: null,
  intakeDonor: null,
  loading: false,
  roleMenu: false,
  mobileMenu: false,
  standby: true,
  online: navigator.onLine,
  wizardStep: 1,
  wizardAnswers: {},
  emergencyActive: false,
  mapFilter: 'All',
  checkItems: { power: true, wifi: true, seating: false, parking: true, privacy: false }
};
state.view = roleConfig[state.role].landing;
document.documentElement.dataset.theme = state.theme;
document.documentElement.lang = state.locale;

const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const toastRegion = document.querySelector('#toast-region');
let modalReturnFocus = null;
let modalCleanup = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function languagePicker(publicStyle = false) {
  return `<label class="language-picker ${publicStyle ? 'public-language' : ''}" aria-label="Application language">${icon('language' in icons ? 'language' : 'building', 'icon-sm')}<select data-action="change-language">${languages.map(([code, label]) => `<option value="${code}" ${state.locale === code ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
}

function pageName() {
  const label = roleConfig[state.role].nav.find(([id]) => id === state.view)?.[1] || roleConfig[state.role].label;
  return t(label, state.locale);
}

function renderLanding() {
  const stats = state.publicStats || {};
  return `<div class="public-site">
    <header class="public-nav">
      <a class="public-brand" href="#top" aria-label="RaktFlow home"><span class="brand-mark">${icon('activity')}</span><span>Rakt<span>Flow</span></span></a>
      <nav class="public-links" aria-label="Public navigation"><a href="#how">How it works</a><a href="#network">For organizations</a><a href="#safety">Safety</a></nav>
      <div class="public-actions">${languagePicker(true)}<button class="btn btn-ghost" data-action="open-auth">Sign in</button><button class="btn btn-primary" data-action="join-donor">Become a donor ${icon('chevron','icon-sm')}</button></div>
    </header>
    <main id="top">
      <section class="hero-section">
        <div class="hero-glow hero-glow-one"></div><div class="hero-glow hero-glow-two"></div>
        <div class="hero-copy">
          <div class="hero-kicker"><span class="status-dot"></span> Verified response network · built for India</div>
          <h1>Blood should be ready <em>before</em> the search becomes desperate.</h1>
          <p class="hero-lead">RaktFlow connects verified donors, blood banks, organizers, and host venues—so one urgent request becomes a coordinated response, not another forwarded message.</p>
          <blockquote>“The most valuable unit is the one that reaches the right patient in time.”</blockquote>
          <div class="hero-actions"><button class="btn btn-primary btn-lg" data-action="join-donor">Join the donor network ${icon('arrowRight' in icons ? 'arrowRight':'chevron')}</button><button class="btn btn-secondary btn-lg" data-action="explore-demo">Explore the live product</button></div>
          <div class="hero-assurance"><span>${icon('shield','icon-sm')} Verified email access</span><span>${icon('lock','icon-sm')} Privacy-first QR intake</span><span>${icon('activity','icon-sm')} Human clinical clearance</span></div>
        </div>
        <div class="hero-product" aria-label="RaktFlow operational preview">
          <div class="product-window">
            <div class="product-bar"><span class="product-dots"><i></i><i></i><i></i></span><span>Regional response grid</span><span class="badge badge-green"><span class="status-dot"></span>Connected</span></div>
            <div class="product-body">
              <div class="product-priority"><span class="emergency-pulse">${icon('alert')}</span><span><small>Verified priority request</small><strong>O− · 2 PRBC units</strong><em>District Maternity Centre · 6.4 km</em></span><span class="response-time">08:42<small>remaining</small></span></div>
              <div class="product-map"><div class="map-grid"></div>${mapArtwork({route:true})}<span class="user-location" style="left:48%;top:48%"></span><span class="map-pin" style="left:28%;top:62%"><span class="pin-head">${icon('droplet')}</span></span><span class="map-pin hospital" style="left:74%;top:39%"><span class="pin-head">${icon('hospital')}</span></span><div class="map-route-label">3 compatible donors responding</div></div>
              <div class="product-metrics"><div><span>Active verified needs</span><strong>${stats.verified_active_requests ?? '—'}</strong></div><div><span>Upcoming drives</span><strong>${stats.upcoming_drives ?? '—'}</strong></div><div><span>Recorded donations</span><strong>${stats.recorded_donations ?? '—'}</strong></div></div>
            </div>
          </div>
          <div class="floating-proof proof-one">${icon('check','icon-sm')} Request clinically verified</div>
          <div class="floating-proof proof-two"><span class="avatar">AK</span><span><strong>Donor accepted</strong><small>ETA shared securely</small></span></div>
        </div>
      </section>
      <section class="trust-strip"><span>One identity</span><i></i><span>Five controlled roles</span><i></i><span>No public patient data</span><i></i><span>Every action audited</span></section>
      <section class="public-section" id="how">
        <div class="section-heading"><span class="section-kicker">From signal to support</span><h2>Less noise. More verified action.</h2><p>Every workflow is designed around the moment someone needs help—and the safeguards required before anyone is contacted.</p></div>
        <div class="feature-grid"><article><span class="feature-number">01</span><span class="feature-icon">${icon('file')}</span><h3>Verify the need</h3><p>Hospital staff submit a time-bound requisition. A named reviewer confirms it before any donor alert leaves the system.</p></article><article><span class="feature-number">02</span><span class="feature-icon">${icon('pin')}</span><h3>Reach the right few</h3><p>Compatibility, consent, eligibility window, and distance narrow a rare request to a small response tier—not a city-wide blast.</p></article><article><span class="feature-number">03</span><span class="feature-icon">${icon('scan')}</span><h3>Move without paperwork</h3><p>A rotating donor pass lets authorized organizers check people in and record collection without rewriting their details.</p></article></div>
      </section>
      <section class="network-section" id="network"><div class="network-copy"><span class="section-kicker">One network, role by role</span><h2>Everyone sees exactly what they need. Nothing more.</h2><p>Donors self-register with verified email. Staff access is invitation-only and controlled by a Super Admin.</p><button class="btn btn-secondary btn-lg" data-action="open-auth">Staff sign in</button></div><div class="role-showcase">${[['droplet','Donor','Profile, screening, drives and pass'],['users','Organizer','QR intake, stations and reconciliation'],['hospital','Hospital','Verification, inventory and dispatch'],['building','Host venue','Proposals, logistics and impact'],['shield','Super Admin','Email invitations and role control']].map((r,i)=>`<div class="showcase-role" style="--delay:${i*.07}s"><span>${icon(r[0])}</span><div><strong>${r[1]}</strong><small>${r[2]}</small></div>${icon('chevron','icon-sm')}</div>`).join('')}</div></section>
      <section class="safety-section" id="safety"><div class="safety-mark">${icon('shield','icon-xl')}</div><div><span class="section-kicker">Trust is designed in</span><h2>A questionnaire cannot prove someone is eligible. So we never pretend it can.</h2><p>Digital answers create a preliminary review path. Final clearance remains with qualified staff after identity, hemoglobin, vital signs, donation interval, and confidential history checks.</p></div><ul><li>${icon('check','icon-sm')} Signed self-attestation</li><li>${icon('check','icon-sm')} Encrypted sensitive answers</li><li>${icon('check','icon-sm')} Mandatory on-site decision</li></ul></section>
      <section class="public-cta"><span class="cta-orb">${icon('heart','icon-xl')}</span><div><span class="section-kicker">A better response starts before the emergency</span><h2>Give one hour. Help a hospital gain time.</h2></div><button class="btn btn-primary btn-lg" data-action="join-donor">Create your donor profile</button></section>
    </main>
    <footer class="public-footer"><span class="public-brand"><span class="brand-mark">${icon('activity')}</span><span>Rakt<span>Flow</span></span></span><p>Verified blood donation and emergency logistics.</p><span>Clinical decisions remain with qualified professionals.</span></footer>
  </div>`;
}

function render() {
  document.body.classList.toggle('landing-mode', state.screen === 'landing');
  if (state.screen === 'landing') {
    app.innerHTML = renderLanding();
    applyTranslations(app, state.locale);
    return;
  }
  const role = roleConfig[state.role];
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" aria-label="Primary navigation">
        <div class="brand">
          <span class="brand-mark">${icon('activity')}</span>
          <span class="brand-copy">RaktFlow<div class="brand-sub">Verified logistics</div></span>
        </div>
        <div class="role-context">
          <span class="role-context-label">Current workspace</span>
          <span class="role-context-value"><span class="role-dot"></span>${role.short}</span>
        </div>
        <div class="nav-label">Workspace</div>
        <nav class="side-nav">${role.nav.map(([id, label, iconName]) => `
          <button class="nav-item ${state.view === id ? 'active' : ''}" data-view="${id}" aria-current="${state.view === id ? 'page' : 'false'}">
            ${icon(iconName)}<span>${label}</span>${id === 'emergencies' ? '<small class="nav-badge">1</small>' : ''}
          </button>`).join('')}
        </nav>
        <div class="sidebar-foot">
          <div class="network-card">
            <div class="network-icon">${icon(state.online ? 'wifi' : 'wifiOff', 'icon-sm')}</div>
            <div><strong>${state.online ? 'Grid connected' : 'Offline mode'}</strong><span>${state.online ? 'Sync healthy · just now' : 'Writes will be queued'}</span></div>
          </div>
        </div>
      </aside>
      <section class="main-shell">
        <header class="topbar">
          <button class="icon-btn mobile-menu" data-action="open-role-menu" aria-label="Switch portal">${icon('menu')}</button>
          <div class="page-identity"><span class="page-eyebrow">${role.label}</span><h2 class="page-title">${pageName()}</h2></div>
          <div class="top-actions">
            ${languagePicker()}
            <div class="role-switcher">
              <button class="btn btn-secondary role-button" data-action="toggle-role-menu" aria-expanded="${state.roleMenu}">
                <span>${icon(role.icon, 'icon-sm')} Viewing as ${role.short}</span>${icon('chevronDown', 'icon-sm')}
              </button>
              ${state.roleMenu ? roleMenu() : ''}
            </div>
            <button class="icon-btn" data-action="toggle-theme" aria-label="Switch to ${state.theme === 'dark' ? 'light' : 'dark'} mode">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button>
            <button class="icon-btn" data-action="notifications" aria-label="Notifications">${icon('bell')}<span class="notification-dot"></span></button>
            <button class="icon-btn desktop-only" data-action="profile" aria-label="Profile settings"><span class="avatar">${state.account?.email?.slice(0,2).toUpperCase() || (state.role === 'donor' ? 'DN' : state.role === 'hospital' ? 'HP' : state.role === 'organizer' ? 'OR' : 'AD')}</span></button>
            ${state.authenticated ? `<button class="btn btn-ghost btn-sm desktop-only" data-action="logout">Sign out</button>` : ''}
          </div>
        </header>
        <main class="content" id="main-content">${renderPage()}</main>
      </section>
    </div>
    ${mobileNav()}`;
  applyTranslations(app, state.locale);
}

function availableRoleEntries() {
  if (state.demoMode) return Object.entries(roleConfig);
  return Object.entries(roleConfig).filter(([, item]) => state.allowedRoles.includes(item.claim));
}

function roleMenu() {
  return `<div class="role-menu" role="menu" aria-label="Available workspaces">
    ${availableRoleEntries().map(([id, item]) => `<button class="role-option ${state.role === id ? 'selected' : ''}" data-role="${id}" role="menuitem">
      <span class="role-option-icon">${icon(item.icon)}</span><span><strong>${item.label}</strong><span>${item.org}</span></span>
    </button>`).join('')}
  </div>`;
}

function mobileNav() {
  const role = roleConfig[state.role];
  return `<nav class="mobile-bottom-nav" aria-label="Mobile navigation">${role.nav.slice(0, 4).map(([id, label, iconName]) => `<button class="bottom-nav-item ${state.view === id ? 'active' : ''}" data-view="${id}">${icon(iconName)}<span>${label.replace('Nearby ', '').replace('Emergency ', '')}</span></button>`).join('')}</nav>`;
}

function renderPage() {
  if (state.role === 'donor') return donorPage();
  if (state.role === 'organizer') return organizerPage();
  if (state.role === 'hospital') return hospitalPage();
  if (state.role === 'admin') return adminPage();
  return venuePage();
}

function header(title, subtitle, actions = '') {
  return `<div class="page-header"><div><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="page-header-actions">${actions}</div>` : ''}</div>`;
}

function metric(iconName, value, label, delta = '', warning = false) {
  return `<article class="card metric-card interactive" tabindex="0"><div class="metric-top"><span class="metric-icon">${icon(iconName)}</span>${delta ? `<span class="metric-delta ${warning ? 'warn' : ''}">${delta}</span>` : ''}</div><div class="metric-value">${value}</div><div class="metric-label">${label}</div></article>`;
}

function mapArtwork({ route = false } = {}) {
  return `<svg class="map-art" viewBox="0 0 700 300" preserveAspectRatio="none" aria-hidden="true">
    <path class="map-water" d="M-30 260C100 210 125 300 250 250s190-10 260 20 150 0 230-30v100H-30Z"/>
    <path class="map-road" d="M-20 95C105 70 165 115 253 88S425 28 512 77s119 52 220 19"/>
    <path class="map-road" d="M102-20c32 91 2 131 49 207s87 94 68 150"/>
    <path class="map-road minor" d="M-40 180c102-18 157-3 227 33s160 4 223-58 165-82 323-49"/>
    <path class="map-road minor" d="M340-20c-14 95 36 114 28 197s-45 96-23 149"/>
    <path class="map-road minor" d="M558-20c18 73-36 112-15 177s67 83 78 169"/>
    ${route ? '<path class="route-path" d="M126 194c76-65 151-27 213-72s121 10 194-34"/><circle class="route-node" cx="126" cy="194" r="7"/><circle class="route-node" cx="533" cy="88" r="7"/>' : ''}
  </svg>`;
}

function donorPage() {
  if (state.view === 'pass') { queueMicrotask(() => openQrPass()); state.view = 'home'; }
  if (state.view === 'drives') return donorDrives();
  if (state.view === 'emergencies') return donorEmergencies();
  if (state.view === 'history') return donorHistoryPage();
  if (state.view === 'resources') return donorResourcesPage();
  return donorHome();
}

function donorHome() {
  const profile = state.donorProfile;
  const firstName = escapeHtml(profile?.full_name?.split(' ')[0] || (state.demoMode ? 'Ananya' : 'Donor'));
  const bloodType = escapeHtml(profile?.blood_type || (state.demoMode ? 'O−' : '—'));
  const precheck = profile?.latest_screening_outcome || (state.demoMode ? 'PROCEED_TO_CLINICAL' : null);
  const live = state.donorAlerts.find(item => item.response === 'PENDING') || state.publicRequests[0];
  const history = state.donationHistory;
  return `
    ${header(`Good morning, ${firstName}`, profile ? `Reference ${escapeHtml(profile.reference_code)} · ${escapeHtml(profile.city || 'Regional donor network')}` : 'Complete your secure profile before generating a donor pass.', `<button class="btn btn-secondary" data-action="profile">${icon('userCheck', 'icon-sm')} ${profile ? 'Edit profile' : 'Complete profile'}</button><button class="btn btn-secondary" data-action="screening">${icon('shield', 'icon-sm')} Health pre-check</button>${!state.allowedRoles.includes('ROLE_HOSPITAL') ? `<button class="btn btn-secondary" data-action="hospital-application">${icon('hospital','icon-sm')} ${state.hospitalProfile ? `Application: ${state.hospitalProfile.status}` : 'Apply as hospital'}</button>` : ''}<button class="btn btn-primary" data-action="open-pass">${icon('qr', 'icon-sm')} Show donor pass</button>`)}
    ${live ? `<section class="emergency-strip" aria-labelledby="emergency-title"><span class="emergency-pulse">${icon('alert')}</span><span class="emergency-copy"><strong id="emergency-title">Verified ${escapeHtml(live.blood_type)} · ${escapeHtml(live.component_type)} need</strong><span>${escapeHtml(live.facility_name)} · ${live.units_needed} unit${live.units_needed === 1 ? '' : 's'} · expires ${new Date(live.expires_at).toLocaleTimeString()}</span></span><button class="btn" data-view="emergencies">Review safely ${icon('chevron', 'icon-sm')}</button></section>` : `<section class="calm-strip">${icon('shield')}<span><strong>No matched urgent alert right now</strong><small>RaktFlow checks only verified, unexpired facility requests.</small></span></section>`}
    <div class="grid grid-3">
      <div class="stack span-2">
        <article class="card"><div class="donor-status"><div class="blood-orb"><span class="blood-orb-shape"></span><strong>${bloodType}</strong></div><div class="status-copy"><span class="section-label">Preliminary readiness</span><h2>${precheck ? precheck.replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase()) : 'Profile and pre-check required'}</h2><p>Final eligibility is decided by qualified staff at the donation site.</p></div><div class="eligibility"><strong>${icon('shield','icon-sm')} On-site check</strong><span>Never auto-cleared online</span></div></div></article>
        <article class="card"><div class="card-header"><div><h2 class="card-title">Upcoming verified drives</h2><p class="card-subtitle">Operational schedules loaded from approved organizers</p></div><button class="btn btn-ghost btn-sm" data-view="drives">View all ${icon('chevron','icon-sm')}</button></div><div class="card-body activity-list">${state.publicDrives.slice(0,3).map(drive => `<div class="activity-item"><span class="activity-icon">${icon('calendar')}</span><span class="activity-copy"><strong>${escapeHtml(drive.name)}</strong><span>${new Date(drive.starts_at).toLocaleString()} · ${escapeHtml(drive.venue_name || drive.address || '')}</span></span><a class="btn btn-secondary btn-sm" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(drive.address || drive.venue_name || '')}" target="_blank" rel="noopener">OSM</a></div>`).join('') || '<div class="empty-state"><h3>No approved drive is scheduled yet</h3><p>Refresh later or use the official blood-centre resources.</p></div>'}</div></article>
      </div>
      <aside class="stack">
        <div class="grid metric-grid-mobile grid-2">${metric('droplet', String(history.length), 'Recorded donations', history[0] ? `Last ${new Date(history[0].collected_at).toLocaleDateString()}` : 'No records yet')}${metric('hospital', String(state.publicCentres.length), 'Verified centres', 'OpenStreetMap')}</div>
        <article class="card"><div class="card-header"><div><h2 class="card-title">Recent donation history</h2><p class="card-subtitle">Clinically cleared, recorded collections only</p></div></div><div class="card-body activity-list">${history.slice(0,3).map(item=>`<div class="activity-item"><span class="activity-icon">${icon('droplet')}</span><span class="activity-copy"><strong>${escapeHtml(item.component_type)} · ${escapeHtml(item.blood_type)}</strong><span>${escapeHtml(item.drive_name)} · ${new Date(item.collected_at).toLocaleDateString()}</span></span><span class="activity-value">${item.volume_ml ? `${item.volume_ml} mL` : 'Recorded'}</span></div>`).join('') || '<p class="muted">Your verified donation history will appear here after collection.</p>'}</div></article>
        <article class="card"><div class="card-header"><div><h2 class="card-title">India help & resources</h2><p class="card-subtitle">Official national services</p></div></div><div class="card-body"><button class="btn btn-secondary" style="width:100%" data-view="resources">Open national resources</button></div></article>
      </aside>
    </div>`;
}

function donorDrives() {
  const drives = state.publicDrives;
  const centres = state.publicCentres;
  return `${header('Nearby donation drives', 'Verified schedules and centres with billing-free OpenStreetMap directions.', `<button class="btn btn-secondary" data-action="locate-me">${icon('navigation','icon-sm')} Use my location</button><button class="btn btn-secondary" data-action="refresh-public">${icon('refresh','icon-sm')} Refresh</button>`)}
    <div class="grid grid-2"><section class="stack"><article class="card"><div class="card-header"><div><h2 class="card-title">Scheduled drives</h2><p class="card-subtitle">Approved or active drives from RaktFlow</p></div><span class="badge badge-green">${drives.length} live</span></div><div class="card-body">${drives.map(d=>`<div class="proposal"><span class="date-tile"><strong>${new Date(d.starts_at).getDate()}</strong><span>${new Date(d.starts_at).toLocaleString(undefined,{month:'short'})}</span></span><div class="proposal-copy"><strong>${escapeHtml(d.name)}</strong><p>${escapeHtml(d.venue_name || '')} · ${new Date(d.starts_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p><div class="proposal-meta"><span>${icon('pin','icon-sm')} ${escapeHtml(d.address || '')}</span><span>${icon('droplet','icon-sm')} Target ${d.target_units}</span></div></div><div class="proposal-actions"><a class="btn btn-primary btn-sm" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(d.address || d.venue_name || '')}" target="_blank" rel="noopener">Open map</a></div></div>`).join('') || '<div class="empty-state"><h3>No approved drives found</h3><p>Only real backend records are displayed.</p></div>'}</div></article></section>
    <section class="stack"><article class="card"><div class="card-header"><div><h2 class="card-title">Verified donation centres</h2><p class="card-subtitle">Facility locations on OpenStreetMap</p></div><span class="badge badge-neutral">No API billing</span></div><div class="card-body activity-list">${centres.slice(0,25).map(c=>`<div class="activity-item"><span class="activity-icon">${icon('hospital')}</span><span class="activity-copy"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.address)}, ${escapeHtml(c.city)}</span></span><a class="btn btn-secondary btn-sm" href="https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=15/${c.latitude}/${c.longitude}" target="_blank" rel="noopener">OSM</a></div>`).join('') || '<div class="empty-state"><h3>No RaktFlow centre coordinates yet</h3><p>Use the official e-RaktKosh directory below.</p><a class="btn btn-primary" href="https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/transactions/bbpublicindex.html" target="_blank" rel="noopener">Open e-RaktKosh</a></div>'}</div></article></section></div>`;
}

function donorEmergencies() {
  const alerts = state.donorAlerts.length ? state.donorAlerts : state.publicRequests;
  return `${header('Verified emergency calls', 'Only verified, unexpired facility requests are shown. A response is not clinical clearance.')}
    <div class="stack">${alerts.map(item=>`<article class="card dispatch-panel"><div class="dispatch-head"><span class="dispatch-head-icon">${icon('alert')}</span><span><strong>${escapeHtml(item.blood_type)} ${item.phenotype_code ? `· ${escapeHtml(item.phenotype_code)}` : ''}</strong><span>${escapeHtml(item.facility_name)} · expires ${new Date(item.expires_at).toLocaleString()}</span></span><span class="badge" style="margin-left:auto;background:#fff;color:var(--rose-700)">${escapeHtml(item.urgency)}</span></div><div class="card-body" style="padding-top:18px"><h2 style="font:800 20px/1.2 Manrope;margin:0 0 7px">${item.units_needed} ${escapeHtml(item.component_type)} unit${item.units_needed===1?'':'s'} requested</h2><p class="muted">Facility verified by RaktFlow. Patient identity and requisition document remain private.</p>${item.id && item.response ? `<div style="display:flex;gap:8px;margin-top:17px"><button class="btn btn-primary" data-action="respond-alert" data-alert-id="${item.id}" data-response="ACCEPTED" ${item.response!=='PENDING'?'disabled':''}>I can respond</button><button class="btn btn-secondary" data-action="respond-alert" data-alert-id="${item.id}" data-response="DECLINED" ${item.response!=='PENDING'?'disabled':''}>Not available</button><span class="badge badge-neutral">${escapeHtml(item.response)}</span></div>` : '<div class="config-note">Targeted response buttons appear only when your verified phenotype is selected for a micro-tier.</div>'}</div></article>`).join('') || '<article class="card"><div class="empty-state"><span class="empty-icon">'+icon('shield')+'</span><h3>No verified emergency call is active</h3><p>Expired and resolved alerts are automatically removed.</p></div></article>'}</div>`;
}

function donorHistoryPage() {
  const rows = state.donationHistory;
  return `${header('Donation history', 'Your clinically cleared collection records and unit references.')}
  <article class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Drive</th><th>Component</th><th>Blood group</th><th>Volume</th><th>Unit reference</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${new Date(row.collected_at).toLocaleString()}</td><td><strong>${escapeHtml(row.drive_name)}</strong><br><span class="muted">${escapeHtml(row.venue_name || '')}</span></td><td>${escapeHtml(row.component_type)}</td><td>${escapeHtml(row.blood_type)}</td><td>${row.volume_ml ? `${row.volume_ml} mL` : '—'}</td><td>${escapeHtml(row.unit_reference)}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state"><h3>No verified donation yet</h3><p>Only completed, clinically cleared collections appear here.</p></div></td></tr>'}</tbody></table></div></article>`;
}

function donorResourcesPage() {
  return `${header('India national helplines & blood resources', 'Use official services. RaktFlow does not replace emergency medical care.')}
  <section class="emergency-strip"><span class="emergency-pulse">${icon('ambulance')}</span><span class="emergency-copy"><strong>Emergency Response Support System: 112</strong><span>Single all-India number for ambulance, police, fire, and disaster response.</span></span><a class="btn" href="tel:112">Call 112</a></section>
  <div class="grid grid-3"><article class="card card-pad"><span class="metric-icon">${icon('hospital')}</span><h2>Indian Red Cross Society</h2><p class="muted">National HQ: +91-11-23716441/2/3<br>Blood centre enquiry: 011-23711551 or 011-23359338</p><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="tel:+911123711551">Call blood centre</a><a class="btn btn-secondary" href="https://www.indianredcross.org/ircs/ircsbloodbanks/" target="_blank" rel="noopener">Directory</a></div></article><article class="card card-pad"><span class="metric-icon">${icon('search')}</span><h2>e-RaktKosh</h2><p class="muted">Government of India blood-bank directory, nearby camps, and stock availability.</p><a class="btn btn-primary" href="https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/transactions/bbpublicindex.html" target="_blank" rel="noopener">Open official portal</a></article><article class="card card-pad"><span class="metric-icon">${icon('pin')}</span><h2>OpenStreetMap discovery</h2><p class="muted">Find nearby blood banks without a billing-dependent map API.</p><a class="btn btn-primary" href="https://www.openstreetmap.org/search?query=blood%20bank" target="_blank" rel="noopener">Search nearby</a></article></div>`;
}

function organizerPage() {
  if (state.view === 'scanner') return organizerScanner();
  if (state.view === 'certificates') return organizerCertificates();
  if (state.view === 'donors') return organizerDonors();
  return organizerCommand();
}

const donorRows = [
  ['Ananya K.','RF-1084','O−','09:42','Cleared','AK'],
  ['Vikram R.','RF-1083','B+','09:38','In donation','VR'],
  ['Meera S.','RF-1082','A+','09:34','Completed','MS'],
  ['Arjun N.','RF-1081','AB+','09:27','Deferred','AN'],
  ['Lakshmi P.','RF-1080','O+','09:21','Completed','LP']
];

function organizerCommand() {
  const drive = state.drives.find(item=>item.id===state.activeDriveId) || state.drives[0];
  const analytics = state.driveAnalytics;
  if (!drive) return `${header('Organizer command center', 'Create the first persistent drive or send a venue proposal.', `<button class="btn btn-secondary" data-action="create-proposal">${icon('mail','icon-sm')} Propose a drive</button><button class="btn btn-primary" data-action="create-drive">${icon('plus','icon-sm')} Create drive</button>`)}<article class="card"><div class="empty-state"><span class="empty-icon">${icon('calendar')}</span><h3>No drive exists for this organizer</h3><p>New records are stored in PostgreSQL and scoped to your account.</p></div></article>`;
  const statusAction = drive.status === 'APPROVED' ? ['ACTIVE','Start drive'] : drive.status === 'ACTIVE' ? ['COMPLETED','Complete drive'] : null;
  return `${header(escapeHtml(drive.name), `${new Date(drive.starts_at).toLocaleString()} · ${escapeHtml(drive.venue_name || '')}`, `<select class="select drive-selector" data-action="select-drive">${state.drives.map(item=>`<option value="${item.id}" ${item.id===drive.id?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select><button class="btn btn-secondary" data-action="edit-drive">${icon('settings','icon-sm')} Edit</button><button class="btn btn-secondary" data-action="create-proposal">${icon('mail','icon-sm')} Venue proposal</button>${statusAction?`<button class="btn btn-primary" data-action="drive-status" data-status="${statusAction[0]}">${statusAction[1]}</button>`:''}<button class="btn btn-primary" data-view="scanner">${icon('scan','icon-sm')} Open intake</button>`)}
  <div class="grid grid-4 metric-grid-mobile">${metric('users',String(analytics?.checkins ?? 0),'Checked in','Real intake')}${metric('droplet',`${analytics?.collections ?? 0} / ${drive.target_units}`,'Units collected',`${analytics?.target_completion_percent ?? 0}% target`)}${metric('userCheck',String(analytics?.cleared ?? 0),'Clinically cleared','Qualified staff')}${metric('alert',String(analytics?.deferred ?? 0),'Deferred donors','Private reasons',Boolean(analytics?.deferred))}</div>
  <div class="grid grid-3" style="margin-top:18px"><article class="card span-2"><div class="card-header"><div><h2 class="card-title">Collection performance</h2><p class="card-subtitle">Backend-derived turnout and collection conversion</p></div><span class="badge ${drive.status==='ACTIVE'?'badge-green':'badge-neutral'}">${escapeHtml(drive.status)}</span></div><div class="card-body"><div class="progress rose" style="height:10px"><span style="width:${Math.min(100,analytics?.target_completion_percent ?? 0)}%"></span></div><div class="grid grid-3" style="margin-top:18px">${metric('activity',`${analytics?.collection_conversion_percent ?? 0}%`,'Check-in conversion')}${metric('syringe',`${analytics?.volume_ml ?? 0} mL`,'Recorded volume')}${metric('calendar',String(state.proposals.filter(p=>p.status==='APPROVED').length),'Approved proposals')}</div></div></article><aside class="card"><div class="card-header"><div><h2 class="card-title">Operate this drive</h2><p class="card-subtitle">Owner-controlled records</p></div></div><div class="card-body stack"><button class="btn btn-primary" data-view="scanner">QR or manual check-in</button><button class="btn btn-secondary" data-action="refresh-drive">Refresh analytics</button><button class="btn btn-secondary" data-action="create-drive">Create another drive</button>${!['COMPLETED','CANCELLED'].includes(drive.status)?'<button class="btn btn-danger-soft" data-action="drive-status" data-status="CANCELLED">Cancel drive</button>':''}</div></aside></div>`;
}

function organizerScanner() {
  const drive = state.drives.find(item=>item.id===state.activeDriveId) || state.drives[0];
  const donor = state.intakeDonor;
  if (state.authenticated && drive && !['APPROVED','ACTIVE'].includes(drive.status)) return `${header('On-site donor intake',escapeHtml(drive.name))}<article class="card"><div class="empty-state"><span class="empty-icon">${icon('shield')}</span><h3>Super Admin approval required</h3><p>This drive is ${escapeHtml(drive.status)}. QR and manual check-in remain locked until approval.</p><button class="btn btn-secondary" data-view="command">Return to command center</button></div></article>`;
  if (state.authenticated && !drive) return `${header('On-site donor intake','Create a drive before accepting QR or manual check-ins.',`<button class="btn btn-primary" data-action="create-drive">${icon('plus','icon-sm')} Create first drive</button>`)}<article class="card"><div class="empty-state"><span class="empty-icon">${icon('calendar')}</span><h3>No drive is assigned to this account</h3><p>A QR scan must always be linked to an authorized drive and staff member.</p><button class="btn btn-primary" data-action="create-drive">Create drive</button></div></article>`;
  return `${header('On-site donor intake', drive?`${drive.name} · ${drive.venue_name}`:'Demo drive · connect backend for real intake', `<button class="btn btn-secondary" data-action="simulate-offline">${icon(state.online?'wifi':'wifiOff','icon-sm')} ${state.online?'Online':'Offline queue'}</button>`)}
    <div class="scanner-layout"><section class="card card-pad"><div class="camera-view" id="camera-view"><div class="camera-noise"></div><div class="scan-reticle"><span class="scan-line"></span></div><span class="camera-status"><span class="status-dot text-green"></span> Camera starts only when you allow it</span></div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-primary" data-action="start-camera" ${drive?'':'disabled'}>${icon('scan','icon-sm')} Start QR camera</button><button class="btn btn-secondary" data-action="paste-token">Paste pass token</button></div><div style="display:flex;gap:9px;margin-top:14px"><div class="field" style="flex:1"><label for="manual-lookup">Manual donor reference</label><input class="input" id="manual-lookup" placeholder="RF-12AB34CD" /></div><button class="btn btn-secondary" style="align-self:end" data-action="manual-checkin" ${drive?'':'disabled'}>${icon('search','icon-sm')} Check in</button></div><p class="field-hint" style="margin-top:8px">Manual fallback requires the donor reference shown in their profile. Phone and medical history are not exposed in search.</p></section>
    <aside class="card"><div class="card-header"><div><h2 class="card-title">Donor intake card</h2><p class="card-subtitle">Minimum authorized information after check-in</p></div>${donor?`<span class="badge ${donor.clearance_status==='CLEARED'?'badge-green':'badge-amber'}">${donor.clearance_status}</span>`:''}</div><div class="card-body">${donor?`<div style="display:flex;gap:13px;align-items:center;padding:14px;border-radius:13px;background:var(--surface-soft)"><span class="avatar" style="width:50px;height:50px;font-size:14px">${donor.display_name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><span><strong style="font:750 15px Manrope">${donor.display_name}</strong><span class="muted" style="display:block;font-size:10px">${donor.donor_reference} · ${donor.blood_type} · age ${donor.age??'review'}</span></span></div><div class="activity-list" style="margin-top:10px"><div class="activity-item"><span class="activity-copy"><strong>Pre-screening route</strong><span>Self-attested; detailed answers restricted</span></span><span class="badge ${donor.latest_screening_outcome==='PROCEED_TO_CLINICAL'?'badge-green':'badge-amber'}">${donor.latest_screening_outcome||'Missing'}</span></div><div class="activity-item"><span class="activity-copy"><strong>Identity status</strong><span>Email verified; staff ID review separate</span></span><span class="badge ${donor.identity_verified?'badge-green':'badge-amber'}">${donor.identity_verified?'Reviewed':'Pending'}</span></div><div class="activity-item"><span class="activity-copy"><strong>Check-in method</strong><span>Automatically audited at ${new Date().toLocaleTimeString()}</span></span><span class="badge badge-neutral">${donor.checkin_method}</span></div></div><div class="stack" style="gap:8px;margin-top:14px">${state.allowedRoles.includes('ROLE_HOSPITAL')||state.allowedRoles.includes('ROLE_SUPER_ADMIN')?`<button class="btn btn-primary btn-lg" data-action="assess-donor">${icon('userCheck')} Record clinical assessment</button>`:`<div class="config-note">${icon('shield','icon-sm')} Awaiting qualified clinical assessment. Organizers cannot self-clear a donor.</div>`}<button class="btn btn-secondary" data-action="record-donation" ${donor.clearance_status==='CLEARED'?'':'disabled'}>${icon('droplet')} Record collected unit</button></div>`:`<div class="empty-state"><span class="empty-icon">${icon('scan')}</span><h3>Ready for the next donor</h3><p>Scan a signed rotating pass or use the donor's reference code.</p></div>`}</div></aside></div>`;
}

function organizerDonors() {
  return `${header('Donor register', 'Drive-scoped operational records. Clinical answers remain restricted.', `<button class="btn btn-secondary">${icon('download','icon-sm')} Export authorized fields</button>`)}<article class="card"><div class="card-header"><div class="field" style="width:min(350px,100%)"><label for="search-donor">Search this drive</label><input id="search-donor" class="input" placeholder="Name or reference ID" /></div><button class="btn btn-secondary btn-sm" style="margin-left:auto">${icon('filter','icon-sm')} Filters</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Donor</th><th>Type</th><th>Arrival</th><th>Station</th><th>Status</th><th>Consent</th></tr></thead><tbody>${donorRows.concat([['Sana M.','RF-1079','A−','09:14','Waiting','SM']]).map((r,i)=>`<tr><td><span class="person"><span class="avatar">${r[5]}</span><span><strong>${r[0]}</strong><span>${r[1]}</span></span></span></td><td>${r[2]}</td><td>${r[3]}</td><td>${i===1?'S-4':i===2?'S-2':'—'}</td><td><span class="badge ${r[4]==='Completed'?'badge-green':r[4]==='Deferred'?'badge-amber':'badge-blue'}">${r[4]}</span></td><td><span class="badge badge-green">Recorded</span></td></tr>`).join('')}</tbody></table></div></article>`;
}

function organizerCertificates() {
  return `${header('Post-drive reconciliation', 'Verify collected units before issuing co-branded participation certificates.', `<button class="btn btn-primary" data-action="generate-certificates">${icon('certificate','icon-sm')} Issue 33 certificates</button>`)}
    <div class="grid grid-4 metric-grid-mobile">${metric('droplet','37','Units logged','100% labeled')}${metric('check','33','Completed','Ready to issue')}${metric('alert','4','Deferred','No certificate')}${metric('mail','0','Delivery failures','All addresses valid')}</div>
    <article class="card" style="margin-top:18px"><div class="card-header"><div><h2 class="card-title">Reconciliation queue</h2><p class="card-subtitle">Only completed, staff-verified donations are eligible</p></div><span class="badge badge-green">Balanced</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Unit ID</th><th>Donor reference</th><th>Component</th><th>Volume</th><th>Verified by</th><th>Certificate</th></tr></thead><tbody>${[['WB-260818-031','RF-1082','Whole blood','450 mL','Dr. Rao'],['WB-260818-030','RF-1080','Whole blood','450 mL','Nurse Devi'],['WB-260818-029','RF-1078','Whole blood','450 mL','Dr. Rao']].map(r=>`<tr><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td><span class="badge badge-green">Ready</span></td></tr>`).join('')}</tbody></table></div></article>`;
}

function hospitalPage() {
  if (!state.hospitalProfile) return `${header('Hospital application required', 'Submit a facility registration for Super Admin verification.', `<button class="btn btn-primary" data-action="hospital-application">${icon('hospital','icon-sm')} Apply now</button>`)}<article class="card"><div class="empty-state"><span class="empty-icon">${icon('shield')}</span><h3>Publishing is locked until verification</h3><p>Hospital applications are reviewed by the RaktFlow Super Admin. Donor access remains separate.</p></div></article>`;
  if (state.hospitalProfile.status !== 'VERIFIED') return `${header(escapeHtml(state.hospitalProfile.facility_name), 'Hospital application review')}<article class="card card-pad"><span class="badge ${state.hospitalProfile.status==='PENDING'?'badge-amber':'badge-rose'}">${escapeHtml(state.hospitalProfile.status)}</span><h2>Super Admin verification required</h2><p class="muted">Registration ${escapeHtml(state.hospitalProfile.registration_number)} · ${escapeHtml(state.hospitalProfile.city)}, ${escapeHtml(state.hospitalProfile.state)}</p>${state.hospitalProfile.rejection_reason?`<div class="config-warning">${icon('alert','icon-sm')} ${escapeHtml(state.hospitalProfile.rejection_reason)}</div>`:''}</article>`;
  if (state.view === 'requisitions') return hospitalRequisitions();
  if (state.view === 'maternity') return hospitalMaternity();
  if (state.view === 'inventory') return hospitalInventory();
  return hospitalOperations();
}

function inventoryGrid() {
  const rows = state.hospitalInventory;
  return `<div class="inventory-grid">${rows.map(row=>{const usable=row.units_available-row.units_reserved;const pct=Math.min(100,Math.round((usable/Math.max(row.minimum_level*3,1))*100));return `<div class="blood-stock"><div class="blood-stock-top"><span class="blood-stock-type">${escapeHtml(row.blood_type)}</span><span class="blood-stock-units">${usable} available</span></div><div class="progress ${row.is_low?'rose':pct<50?'amber':''}"><span style="width:${pct}%"></span></div><small>${escapeHtml(row.component_type)} · ${escapeHtml(row.phenotype_code || 'STANDARD')} · par ${row.minimum_level}</small></div>`;}).join('') || '<div class="empty-state"><h3>No inventory recorded</h3><p>Record a receipt to create the first component balance.</p></div>'}</div>`;
}

function regionalMap(route=false) {
  return `<div class="route-map">${mapArtwork({route})}<svg class="map-art" viewBox="0 0 700 300" preserveAspectRatio="none" aria-hidden="true"><circle class="heat heat-critical" cx="150" cy="110" r="65"/><circle class="heat heat-warn" cx="405" cy="180" r="82"/><circle class="heat heat-ok" cx="575" cy="75" r="50"/></svg><span class="map-label" style="left:16%;top:24%">DGH · O− critical</span><span class="map-label" style="left:52%;top:58%">Health City · A− low</span><span class="map-label" style="left:76%;top:14%">KGH · stable</span></div>`;
}

function hospitalOperations() {
  const inventoryTotal=state.hospitalInventory.reduce((sum,row)=>sum+row.units_available,0);
  const low=state.hospitalInventory.filter(row=>row.is_low).length;
  const active=state.hospitalRequests.filter(row=>['PENDING','VERIFIED'].includes(row.status)).length;
  return `${header('Clinical operations', `${escapeHtml(state.hospitalProfile.facility_name)} · verified facility`, `<button class="btn btn-secondary" data-action="refresh-hospital">${icon('refresh','icon-sm')} Refresh</button><button class="btn btn-primary" data-action="new-request">${icon('plus','icon-sm')} New requisition</button>`)}
  <div class="grid grid-4 metric-grid-mobile">${metric('inventory',String(inventoryTotal),'Total recorded units','All components')}${metric('alert',String(low),'Low-stock lines','At or below par',low>0)}${metric('file',String(active),'Active requests','Owned by facility')}${metric('check',String(state.hospitalRequests.filter(r=>r.status==='RESOLVED').length),'Resolved requests','Audit retained')}</div>
  <div class="grid grid-3" style="margin-top:18px"><article class="card span-2"><div class="card-header"><div><h2 class="card-title">Live blood inventory</h2><p class="card-subtitle">Receipts, issues, discards, and adjustments persist as audited events</p></div><button class="btn btn-primary btn-sm" data-action="inventory-event">Record movement</button></div><div class="card-body">${inventoryGrid()}</div></article><aside class="stack"><button class="danger-action" data-action="pph-confirm"><span class="danger-action-icon">${icon('ambulance','icon-lg')}</span><span><strong>Activate PPH bridge</strong><span>Protected maternity emergency dispatch</span></span>${icon('chevron','icon-lg')}</button><article class="card"><div class="card-header"><div><h2 class="card-title">Demand workflow</h2><p class="card-subtitle">Verified hospital only</p></div></div><div class="card-body activity-list">${state.hospitalRequests.slice(0,4).map(item=>`<div class="activity-item"><span class="activity-icon">${icon('file')}</span><span class="activity-copy"><strong>${escapeHtml(item.blood_type)} · ${escapeHtml(item.component_type)}</strong><span>${item.units_needed} units · ${escapeHtml(item.urgency)}</span></span><span class="badge ${item.status==='VERIFIED'?'badge-green':item.status==='PENDING'?'badge-amber':'badge-neutral'}">${escapeHtml(item.status)}</span></div>`).join('') || '<p class="muted">No requisition created.</p>'}</div></article></aside></div>`;
}

function hospitalInventory() {
  return `${header('Blood inventory', 'Component and phenotype balances owned by this verified facility.', `<button class="btn btn-secondary" data-action="refresh-hospital">${icon('refresh','icon-sm')} Refresh</button><button class="btn btn-primary" data-action="inventory-event">${icon('plus','icon-sm')} Record receipt / issue</button>`)}<article class="card"><div class="card-header"><div><h2 class="card-title">Current balances</h2><p class="card-subtitle">ABO/Rh groups and separately identified rare phenotypes</p></div><span class="badge badge-green">Audited events</span></div><div class="card-body">${inventoryGrid()}</div></article>`;
}

function hospitalRequisitions() {
  const rows=state.hospitalRequests;
  return `${header('Emergency requisitions', 'Create, clinically verify, publish, and resolve time-bound facility demands.', `<button class="btn btn-primary" data-action="new-request">${icon('plus','icon-sm')} Build requisition</button>`)}
  <div class="grid grid-4 metric-grid-mobile">${metric('file',String(rows.filter(r=>['PENDING','VERIFIED'].includes(r.status)).length),'Active requests','Backend records')}${metric('clock',String(rows.filter(r=>r.status==='PENDING').length),'Pending review','Clinical checks')}${metric('alert',String(rows.filter(r=>r.status==='VERIFIED').length),'Published alerts','Verified only')}${metric('check',String(rows.filter(r=>r.status==='RESOLVED').length),'Resolved','Alerts revoked')}</div>
  <article class="card" style="margin-top:18px"><div class="table-wrap"><table class="data-table"><thead><tr><th>Created need</th><th>Phenotype</th><th>Units</th><th>Urgency</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead><tbody>${rows.map(item=>`<tr><td><strong>${escapeHtml(item.blood_type)} · ${escapeHtml(item.component_type)}</strong><br><span class="muted">${escapeHtml(item.facility_name || '')}</span></td><td>${escapeHtml(item.phenotype_code || 'Standard')}</td><td>${item.units_needed}</td><td><span class="badge ${item.urgency.includes('RARE')||item.urgency.includes('CRITICAL')?'badge-rose':'badge-amber'}">${escapeHtml(item.urgency)}</span></td><td><span class="badge ${item.status==='VERIFIED'?'badge-green':item.status==='PENDING'?'badge-amber':'badge-neutral'}">${escapeHtml(item.status)}</span></td><td>${new Date(item.expires_at).toLocaleString()}</td><td><div class="table-actions">${item.status==='PENDING'?`<button class="btn btn-primary btn-sm" data-action="verify-request" data-request-id="${item.id}">Clinical verify</button>`:''}${item.status==='VERIFIED'?`<button class="btn btn-secondary btn-sm" data-action="resolve-request" data-request-id="${item.id}">Resolve</button>`:''}</div></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty-state"><h3>No requisitions</h3><p>Create a request with a doctor-signed PDF, JPEG, or PNG.</p></div></td></tr>'}</tbody></table></div></article>`;
}

function hospitalMaternity() {
  return `${header('Maternity blood bridge', 'Protected emergency channel for time-critical postpartum hemorrhage response.', `<button class="btn btn-secondary" data-action="rare-pager">${icon('droplet','icon-sm')} Rare pager</button>`)}
    ${state.emergencyActive ? `<section class="emergency-strip"><span class="emergency-pulse">${icon('ambulance')}</span><span class="emergency-copy"><strong>PPH bridge PPH-260816-04 is active</strong><span>Elapsed 18 min · courier en route · clinical owner Dr. S. Devi</span></span><button class="btn" data-action="dispatch-details">Open dispatch</button></section>` : ''}
    <div class="grid grid-3"><div class="stack span-2"><article class="card"><div class="card-header"><div><h2 class="card-title">Rapid dispatch console</h2><p class="card-subtitle">Authorized maternity staff only · every action audited</p></div><span class="badge badge-rose">2-hour protocol</span></div><div class="card-body"><button class="danger-action" data-action="pph-confirm" data-warm><span class="danger-action-icon">${icon('ambulance','icon-lg')}</span><span><strong>${state.emergencyActive?'Update active PPH bridge':'Activate PPH emergency bridge'}</strong><span>Notify blood bank, universal donor micro-tier, and courier desk</span></span>${icon('chevron','icon-lg')}</button><div style="margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft);display:flex;gap:10px;align-items:flex-start"><span class="metric-icon">${icon('shield')}</span><span><strong style="display:block;font-size:11px">Clinical decision support—not a transfusion order</strong><span class="muted" style="font-size:9px">Blood compatibility, emergency-release authorization, and administration remain under qualified clinical control.</span></span></div></div></article>
    <article class="card"><div class="card-header"><div><h2 class="card-title">Live transit map</h2><p class="card-subtitle">Courier telemetry shared with receiving ward</p></div><span class="badge badge-green"><span class="status-dot"></span>${state.emergencyActive?'Courier en route':'Network ready'}</span></div><div class="card-body">${regionalMap(true)}</div></article></div>
    <aside class="stack"><article class="card dispatch-panel"><div class="dispatch-head"><span class="dispatch-head-icon">${icon('clock')}</span><span><strong>${state.emergencyActive?'Dispatch timeline':'Response readiness'}</strong><span>${state.emergencyActive?'Target arrival 10:54':'No active emergency'}</span></span></div><div class="dispatch-timeline">${[['Ward alert','09:58','done'],['Blood bank acknowledgment','10:01','done'],['Units released','10:09',state.emergencyActive?'done':''],['Courier en route','ETA 18m',state.emergencyActive?'active':''],['Delivery room handoff','Pending','']].map(s=>`<div class="timeline-step ${s[2]}"><span class="timeline-dot">${s[2]==='done'?icon('check','icon-sm'):''}</span><span class="timeline-copy"><strong>${s[0]}</strong><span>${s[2]==='active'?'Live GPS telemetry':s[2]==='done'?'Audit event recorded':'Awaiting prior step'}</span></span><time>${s[1]}</time></div>`).join('')}</div></article>
    <article class="card"><div class="card-header"><div><h2 class="card-title">Response pool</h2><p class="card-subtitle">Pre-screened standby resources</p></div></div><div class="card-body activity-list"><div class="activity-item"><span class="activity-icon">${icon('droplet')}</span><span class="activity-copy"><strong>O− donors</strong><span>First micro-tier · 15 km</span></span><span class="activity-value">3</span></div><div class="activity-item"><span class="activity-icon">${icon('droplet')}</span><span class="activity-copy"><strong>O+ donors</strong><span>Clinician-authorized fallback</span></span><span class="activity-value">12</span></div><div class="activity-item"><span class="activity-icon">${icon('truck')}</span><span class="activity-copy"><strong>Volunteer couriers</strong><span>Credentialed and on shift</span></span><span class="activity-value">4</span></div></div></article></aside></div>`;
}

function venuePage() {
  if (state.view === 'campaign') return venueCampaign();
  if (state.view === 'impact') return venueImpact();
  if (state.view === 'logistics') return venueLogistics();
  return venueProposals();
}

function venueProposals() {
  const rows=state.proposals;
  return `${header('Drive proposals', 'Review organizer requests; approval creates a real scheduled drive.', `<button class="btn btn-secondary" data-action="refresh-proposals">${icon('refresh','icon-sm')} Refresh</button>`)}
  <div class="grid grid-4 metric-grid-mobile">${metric('file',String(rows.filter(p=>p.status==='PENDING').length),'Open proposals','Actionable')}${metric('calendar',String(rows.filter(p=>p.status==='APPROVED').length),'Approved drives','Persistent')}${metric('alert',String(rows.filter(p=>p.status==='CHANGES_REQUESTED').length),'Changes requested','Awaiting organizer')}${metric('droplet',String(rows.filter(p=>p.status==='APPROVED').reduce((sum,p)=>sum+p.target_units,0)),'Target units enabled','Approved proposals')}</div>
  <article class="card" style="margin-top:18px"><div class="card-header"><div><h2 class="card-title">Proposal review desk</h2><p class="card-subtitle">Only proposals addressed to this verified email are visible</p></div></div><div class="card-body">${rows.map(p=>`<div class="proposal"><span class="date-tile"><strong>${new Date(p.starts_at).getDate()}</strong><span>${new Date(p.starts_at).toLocaleString(undefined,{month:'short'})}</span></span><div class="proposal-copy"><strong>${escapeHtml(p.proposed_name)}</strong><p>${escapeHtml(p.venue_name)} · ${escapeHtml(p.address)}</p><div class="proposal-meta"><span>${icon('droplet','icon-sm')} Target ${p.target_units}</span><span>${icon('clock','icon-sm')} ${new Date(p.starts_at).toLocaleString()}</span></div></div><div class="proposal-actions"><span class="badge ${p.status==='APPROVED'?'badge-green':p.status==='PENDING'?'badge-amber':'badge-neutral'}">${escapeHtml(p.status)}</span>${['PENDING','CHANGES_REQUESTED'].includes(p.status)?`<button class="btn btn-primary btn-sm" data-action="proposal-decision" data-proposal-id="${p.id}" data-decision="APPROVED">Approve</button><button class="btn btn-secondary btn-sm" data-action="proposal-decision" data-proposal-id="${p.id}" data-decision="CHANGES_REQUESTED">Request changes</button><button class="btn btn-danger-soft btn-sm" data-action="proposal-decision" data-proposal-id="${p.id}" data-decision="REJECTED">Reject</button>`:''}</div></div>`).join('') || '<div class="empty-state"><h3>No proposals addressed to this venue</h3><p>Organizer proposals persist and appear here by host email.</p></div>'}</div></article>`;
}

function venueCampaign() {
  return `${header('Campaign promotion builder', 'Create a co-branded registration link and privacy-safe campaign assets.', `<button class="btn btn-primary" data-action="download-assets">${icon('download','icon-sm')} Download asset pack</button>`)}
    <div class="grid grid-2"><article class="card"><div class="card-header"><div><h2 class="card-title">Registration link</h2><p class="card-subtitle">HarborTech Community Drive · 18 August</p></div><span class="badge badge-green">Live</span></div><div class="card-body"><div class="field"><label for="campaign-link">Shareable URL</label><div style="display:flex;gap:7px"><input id="campaign-link" class="input" value="raktflow.org/drives/harbortech-aug26" readonly><button class="btn btn-secondary" data-action="copy-link" aria-label="Copy link">${icon('copy')}</button></div></div><div class="grid grid-2" style="margin-top:14px"><div style="padding:13px;border-radius:12px;background:var(--surface-soft)"><span class="section-label">Visitors</span><strong style="font:800 22px Manrope">286</strong></div><div style="padding:13px;border-radius:12px;background:var(--surface-soft)"><span class="section-label">Conversion</span><strong style="font:800 22px Manrope">29.4%</strong></div></div><div style="display:flex;gap:8px;margin-top:13px"><button class="btn btn-secondary">${icon('mail','icon-sm')} Email copy</button><button class="btn btn-secondary">${icon('qr','icon-sm')} QR only</button></div></div></article>
    <article class="card"><div class="card-header"><div><h2 class="card-title">Asset preview</h2><p class="card-subtitle">Accessible digital poster · 1080 × 1350</p></div><span class="badge badge-neutral">Preview</span></div><div class="card-body"><div style="min-height:330px;padding:28px;border-radius:15px;color:white;background:linear-gradient(145deg,#0f172a,#1e293b);display:flex;flex-direction:column;position:relative;overflow:hidden"><span style="position:absolute;width:220px;height:220px;border-radius:50%;right:-80px;top:-80px;background:rgb(225 29 72/.18)"></span><span style="display:flex;align-items:center;gap:8px;font:800 17px Manrope"><span class="brand-mark" style="width:28px;height:31px">${icon('activity','icon-sm')}</span> RaktFlow × HarborTech</span><span style="margin-top:auto;color:#fda4af;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Give time. Give blood.</span><strong style="font:800 30px/1.1 Manrope;max-width:340px;margin:8px 0">Your hour can move care forward.</strong><span style="color:#cbd5e1">18 August · Main Auditorium · 10:00–16:00</span><button class="btn btn-primary" style="margin-top:18px;width:max-content">Reserve a slot</button></div></div></article></div>`;
}

function venueImpact() {
  const a=state.driveAnalytics;
  return `${header('Turnout & collection impact', 'Aggregated backend-derived measures; no donor identity or health answers.', `<button class="btn btn-secondary" data-action="refresh-proposals">${icon('refresh','icon-sm')} Refresh</button>`)}
  <div class="grid grid-4 metric-grid-mobile">${metric('users',String(a?.checkins??0),'Verified check-ins','Scanner + manual')}${metric('droplet',String(a?.collections??0),'Collected units',`${a?.target_completion_percent??0}% target`)}${metric('userCheck',String(a?.cleared??0),'Clinically cleared','Qualified decision')}${metric('activity',`${a?.collection_conversion_percent??0}%`,'Turnout conversion','Collection / check-in')}</div>
  <article class="card" style="margin-top:18px"><div class="card-header"><div><h2 class="card-title">Approved-drive outcome</h2><p class="card-subtitle">${escapeHtml(a?.drive?.name||'No approved drive has reported activity')}</p></div><span class="badge badge-green">Privacy-safe aggregate</span></div><div class="card-body"><div class="progress rose" style="height:12px"><span style="width:${Math.min(100,a?.target_completion_percent??0)}%"></span></div><p class="muted">${a?.collections??0} of ${a?.target_units??0} target units · ${a?.volume_ml??0} mL recorded · ${a?.deferred??0} confidential deferrals</p></div></article>`;
}

function venueLogistics() {
  const items = [
    ['power','Power supply & backup','Facilities','Confirmed'],['wifi','Secure staff Wi-Fi','IT desk','Confirmed'],['seating','Donor recovery seating (30)','Admin','Pending'],['parking','Ambulance and loading access','Security','Confirmed'],['privacy','Clinical privacy partitions','Facilities','Pending']
  ];
  return `${header('Venue logistics', 'HarborTech Community Drive · readiness checklist for 18 August.', `<button class="btn btn-primary" data-action="save-logistics">${icon('check','icon-sm')} Save readiness</button>`)}
    <div class="grid grid-3"><article class="card span-2"><div class="card-header"><div><h2 class="card-title">Facility prerequisites</h2><p class="card-subtitle">Shared with the organizing body</p></div><span class="badge badge-amber">${Object.values(state.checkItems).filter(Boolean).length} / 5 complete</span></div><div class="card-body checklist">${items.map(i=>`<button class="check-row" style="border-left:0;border-right:0;border-top:0;background:transparent;width:100%;text-align:left;cursor:pointer" data-check="${i[0]}"><span class="checkbox ${state.checkItems[i[0]]?'checked':''}">${state.checkItems[i[0]]?icon('check','icon-sm'):''}</span><span><strong>${i[1]}</strong><span style="display:block;margin:0">Owner · ${i[2]}</span></span><span class="badge ${state.checkItems[i[0]]?'badge-green':'badge-amber'}">${state.checkItems[i[0]]?'Confirmed':'Pending'}</span></button>`).join('')}</div></article><aside class="stack"><article class="card"><div class="card-header"><div><h2 class="card-title">Overall readiness</h2><p class="card-subtitle">Critical checks before handoff</p></div></div><div class="card-body" style="text-align:center"><div class="donut" style="margin:auto;background:conic-gradient(var(--emerald-500) 0 ${Object.values(state.checkItems).filter(Boolean).length*20}%,var(--slate-200) 0)"><span class="donut-value"><strong>${Object.values(state.checkItems).filter(Boolean).length*20}%</strong><span>Ready</span></span></div><p class="muted" style="font-size:10px">All items must be confirmed 12 hours before staff setup.</p></div></article><article class="card"><div class="card-header"><div><h2 class="card-title">Organizer contact</h2><p class="card-subtitle">Red Cross Coastal Chapter</p></div></div><div class="card-body"><button class="btn btn-secondary" style="width:100%">${icon('mail','icon-sm')} Message coordinator</button></div></article></aside></div>`;
}

function adminPage() {
  if (state.view === 'hospitals') return adminHospitalVerification();
  if (state.view === 'driveApprovals') return adminDriveApprovals();
  if (state.view === 'invitations') return adminInvitations();
  if (state.view === 'audit') return adminAudit();
  if (state.view === 'platform') return adminPlatform();
  return adminAccess();
}

function adminAccess() {
  const users = state.adminUsers;
  return `${header('Email access control', 'Grant each verified email only the workspaces required for their responsibility.', `<button class="btn btn-secondary" data-action="refresh-admin">${icon('refresh','icon-sm')} Refresh</button><button class="btn btn-primary" data-action="invite-user">${icon('mail','icon-sm')} Invite staff</button>`)}
    <div class="grid grid-4 metric-grid-mobile">${metric('users',String(users.length),'Registered users','Role-controlled')}${metric('mail',String(state.invitations.filter(i=>i.status==='PENDING').length),'Pending invites','7-day expiry')}${metric('shield',String(users.filter(u=>u.roles.includes('ROLE_SUPER_ADMIN')).length),'Super admins','Protected')}${metric('activity','100%','Role changes','Audited')}</div>
    <article class="card" style="margin-top:18px"><div class="card-header"><div><h2 class="card-title">People and permissions</h2><p class="card-subtitle">Users must refresh their token after a role change</p></div><span class="badge badge-green">Firebase claims synced</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Email</th><th>Granted workspaces</th><th>Status</th><th>Joined</th><th class="text-right">Action</th></tr></thead><tbody>${users.length ? users.map(user=>`<tr><td><span class="person"><span class="avatar">${user.email.slice(0,2).toUpperCase()}</span><span><strong>${user.email}</strong><span>${user.id.slice(0,8)}</span></span></span></td><td><div style="display:flex;gap:4px;flex-wrap:wrap">${user.roles.map(role=>`<span class="badge ${role==='ROLE_SUPER_ADMIN'?'badge-rose':'badge-neutral'}">${role.replace('ROLE_','').replaceAll('_',' ')}</span>`).join('')}</div></td><td><span class="badge ${user.active?'badge-green':'badge-amber'}">${user.active?'Active':'Disabled'}</span></td><td>${new Date(user.created_at).toLocaleDateString()}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-action="edit-roles" data-user-id="${user.id}">Edit roles</button></div></td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">${icon('users')}</span><h3>No users loaded</h3><p>Connect the backend and sign in as the bootstrap administrator.</p></div></td></tr>`}</tbody></table></div></article>`;
}

function adminDriveApprovals() {
  const rows=state.adminDrives;
  return `${header('Drive approvals', 'Review organizer-created drives before QR or manual donor intake can start.', `<button class="btn btn-secondary" data-action="refresh-admin">${icon('refresh','icon-sm')} Refresh</button>`)}<article class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Drive</th><th>Venue</th><th>Schedule</th><th>Target</th><th>Status</th><th>Decision</th></tr></thead><tbody>${rows.map(item=>`<tr><td><strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.address||'')}</span></td><td>${escapeHtml(item.venue_name||'')}</td><td>${new Date(item.starts_at).toLocaleString()}</td><td>${item.target_units}</td><td><span class="badge ${item.status==='APPROVED'||item.status==='ACTIVE'?'badge-green':item.status==='PLANNED'?'badge-amber':'badge-neutral'}">${escapeHtml(item.status)}</span></td><td><div class="table-actions">${item.status==='PLANNED'?`<button class="btn btn-primary btn-sm" data-action="admin-drive-status" data-drive-id="${item.id}" data-status="APPROVED">Approve</button>`:''}${!['COMPLETED','CANCELLED'].includes(item.status)?`<button class="btn btn-danger-soft btn-sm" data-action="admin-drive-status" data-drive-id="${item.id}" data-status="CANCELLED">Cancel</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty-state"><h3>No drives submitted</h3><p>Organizer-owned planned drives appear here.</p></div></td></tr>'}</tbody></table></div></article>`;
}

function adminHospitalVerification() {
  const applications = state.hospitalApplications;
  return `${header('Hospital verification', 'Review facility registration before any hospital can publish a blood demand.', `<button class="btn btn-secondary" data-action="refresh-admin">${icon('refresh','icon-sm')} Refresh</button>`)}
  <div class="grid grid-4 metric-grid-mobile">${metric('hospital',String(applications.length),'Applications','All states')}${metric('clock',String(applications.filter(item=>item.status==='PENDING').length),'Pending review','Action required')}${metric('check',String(applications.filter(item=>item.status==='VERIFIED').length),'Verified hospitals','Can publish')}${metric('alert',String(applications.filter(item=>item.status==='SUSPENDED').length),'Suspended','Publishing blocked')}</div>
  <article class="card" style="margin-top:18px"><div class="table-wrap"><table class="data-table"><thead><tr><th>Facility</th><th>Registration</th><th>Institutional email</th><th>Location</th><th>Status</th><th>Decision</th></tr></thead><tbody>${applications.map(item=>`<tr><td><strong>${escapeHtml(item.facility_name)}</strong><br><span class="muted">${escapeHtml(item.address)}</span></td><td>${escapeHtml(item.registration_number)}</td><td>${escapeHtml(item.institutional_email)}</td><td>${escapeHtml(item.city)}, ${escapeHtml(item.state)}</td><td><span class="badge ${item.status==='VERIFIED'?'badge-green':item.status==='PENDING'?'badge-amber':'badge-rose'}">${escapeHtml(item.status)}</span></td><td><div class="table-actions"><button class="btn btn-primary btn-sm" data-action="hospital-decision" data-hospital-id="${item.id}" data-decision="VERIFIED">Verify</button><button class="btn btn-secondary btn-sm" data-action="hospital-decision" data-hospital-id="${item.id}" data-decision="REJECTED">Reject</button>${item.status==='VERIFIED'?`<button class="btn btn-danger-soft btn-sm" data-action="hospital-decision" data-hospital-id="${item.id}" data-decision="SUSPENDED">Suspend</button>`:''}</div></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state"><h3>No hospital applications</h3><p>Applications submitted by verified-email users appear here.</p></div></td></tr>'}</tbody></table></div></article>`;
}

function adminInvitations() {
  return `${header('Staff invitations', 'Email-bound invitations expire after seven days and never grant access before sign-in.', `<button class="btn btn-primary" data-action="invite-user">${icon('plus','icon-sm')} New invitation</button>`)}<article class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Email</th><th>Roles</th><th>Status</th><th>Sent</th><th>Expires</th></tr></thead><tbody>${state.invitations.length ? state.invitations.map(item=>`<tr><td><strong>${item.email}</strong></td><td>${item.roles.map(r=>r.replace('ROLE_','')).join(', ')}</td><td><span class="badge ${item.status==='ACCEPTED'?'badge-green':item.status==='PENDING'?'badge-amber':'badge-neutral'}">${item.status}</span></td><td>${item.sent_at?new Date(item.sent_at).toLocaleString():'Provider pending'}</td><td>${new Date(item.expires_at).toLocaleDateString()}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty-state"><h3>No invitations yet</h3><p>Invite your organizer, hospital, or venue team by verified email.</p></div></td></tr>`}</tbody></table></div></article>`;
}

function adminAudit() {
  return `${header('Security audit trail', 'Role changes, sign-ins, QR check-ins, clinical decisions, and donation records are append-only.')}<article class="card"><div class="card-body" style="padding-top:20px"><div class="empty-state"><span class="empty-icon">${icon('activity')}</span><h3>Audit events remain server-controlled</h3><p>The backend records integrity-chained events. Add a paginated read endpoint only for designated auditors before production.</p></div></div></article>`;
}

function adminPlatform() {
  return `${header('Platform readiness', 'Configuration required before real donor data is collected.')}<div class="grid grid-2"><article class="card"><div class="card-header"><div><h2 class="card-title">Required integrations</h2><p class="card-subtitle">Production environment</p></div></div><div class="card-body checklist">${[['Firebase authentication',isAuthConfigured()],['FastAPI backend',Boolean(import.meta.env.VITE_API_BASE_URL)],['Private PostgreSQL','server'],['Transactional email','server'],['PII encryption key','server']].map(item=>`<div class="check-row"><span class="checkbox ${item[1]?'checked':''}">${item[1]?icon('check','icon-sm'):''}</span><strong>${item[0]}</strong><span>${item[1]?'Configured / server check':'Not configured'}</span></div>`).join('')}</div></article><article class="card"><div class="card-header"><div><h2 class="card-title">Access policy</h2><p class="card-subtitle">Current design</p></div></div><div class="card-body activity-list"><div class="activity-item"><span class="activity-icon">${icon('droplet')}</span><span class="activity-copy"><strong>Donors</strong><span>Self-register after verified email</span></span></div><div class="activity-item"><span class="activity-icon">${icon('shield')}</span><span class="activity-copy"><strong>Staff</strong><span>Invitation and explicit roles required</span></span></div><div class="activity-item"><span class="activity-icon">${icon('lock')}</span><span class="activity-copy"><strong>Sensitive health data</strong><span>Encrypted and clinically restricted</span></span></div></div></article></div>`;
}

function openModal({ title, subtitle = '', body, footer = '', wide = false, onOpen }) {
  if (!modalRoot.firstElementChild) modalReturnFocus = document.activeElement;
  if (typeof modalCleanup === 'function') modalCleanup();
  modalCleanup = null;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel><header class="modal-head"><div><h2 id="modal-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-btn modal-close" data-action="close-modal" aria-label="Close dialog">${icon('x')}</button></header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}</section></div>`;
  document.body.style.overflow = 'hidden';
  modalRoot.querySelector('button, input, select')?.focus();
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

function authModal(mode = 'signin') {
  const donor = mode === 'donor';
  openModal({
    title: donor ? 'Join as a donor' : 'Secure sign in',
    subtitle: donor ? 'Donors receive only the Donor workspace by default' : 'Staff roles are assigned by a Super Admin invitation',
    body: `<div class="auth-panel"><div class="auth-icon">${icon(donor?'heart':'lock','icon-lg')}</div><h3>${donor?'Your verified donor identity starts with email.':'Welcome back to RaktFlow.'}</h3><p>${donor?'We send a passwordless link. Your phone and health information are collected only after sign-in.':'Use the email that received your role invitation. Uninvited accounts receive Donor access only.'}</p><form id="auth-form" class="field"><label for="auth-email">Email address</label><input class="input" id="auth-email" type="email" autocomplete="email" placeholder="you@example.com" required></form>${!isAuthConfigured()?`<div class="config-warning">${icon('alert','icon-sm')} Firebase environment variables are not configured in this deployment. You can still explore the product demo.</div>`:''}<button class="btn btn-primary btn-lg" style="width:100%;margin-top:14px" data-action="send-magic-link">${icon('mail','icon-sm')} Email me a secure sign-in link</button><div class="auth-divider"><span>or</span></div><button class="btn btn-secondary btn-lg" style="width:100%" data-action="google-signin">Continue with Google</button><p class="auth-legal">By continuing, you agree to the privacy notice and understand that online screening is not clinical clearance.</p></div>`,
    footer: `<button class="btn btn-ghost" data-action="explore-from-modal">Explore demo instead</button>`
  });
}

function donorProfileModal() {
  const p = state.donorProfile || {};
  openModal({ title: p.reference_code ? 'Edit donor profile' : 'Complete donor profile', subtitle: 'Identity and contact details are encrypted or tokenized at rest', wide: true,
    body: `<form id="donor-profile-form" class="form-grid"><div class="field"><label for="profile-name">Full legal name</label><input class="input" id="profile-name" name="full_name" value="${p.full_name || ''}" autocomplete="name" required minlength="2"></div><div class="field"><label for="profile-dob">Date of birth</label><input class="input" id="profile-dob" name="date_of_birth" type="date" required></div><div class="field"><label for="profile-phone">Mobile number</label><input class="input" id="profile-phone" name="phone" type="tel" inputmode="tel" placeholder="+91 98765 43210" required><span class="field-hint">Used for authorized operational contact—not public lookup.</span></div><div class="field"><label for="profile-city">City / district</label><input class="input" id="profile-city" name="city" value="${p.city || ''}" required></div><div class="field"><label for="profile-blood">Known blood group</label><select class="select" id="profile-blood" name="blood_type">${['UNKNOWN','A+','A-','B+','B-','AB+','AB-','O+','O-','BOMBAY'].map(x=>`<option ${p.blood_type===x?'selected':''}>${x}</option>`).join('')}</select><span class="field-hint">Select Unknown unless confirmed by an authorized test.</span></div><div class="field"><label>Profile verification</label><div class="input" style="display:flex;align-items:center;gap:8px;color:var(--muted)">${icon('shield','icon-sm')} ${p.identity_verified?'Identity reviewed by staff':'Email verified; identity review pending'}</div></div><label class="field full consent-row"><input type="checkbox" id="profile-consent" required><span>I consent to RaktFlow processing these details for donor registration, drive intake, and authorized blood-logistics communication.</span></label></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-profile">Save secure profile</button>` });
}

function inviteUserModal() {
  openModal({ title:'Invite staff by email', subtitle:'The recipient receives only the roles you explicitly select',
    body:`<form id="invite-form"><div class="field"><label for="invite-email">Staff email address</label><input class="input" id="invite-email" name="email" type="email" required placeholder="organizer@example.org"></div><fieldset class="role-check-grid"><legend>Workspace permissions</legend>${[['ROLE_DONOR','Donor','Personal donor profile and pass'],['ROLE_ORGANIZER','Organizer','Drives, QR intake and reconciliation'],['ROLE_HOSPITAL','Hospital','Clinical requests and assessments'],['ROLE_HOST_VENUE','Host venue','Proposals, logistics and ESG'],['ROLE_SUPER_ADMIN','Super Admin','All access and permission control']].map(r=>`<label><input type="checkbox" name="roles" value="${r[0]}"><span class="role-option-icon">${icon(r[0]==='ROLE_DONOR'?'droplet':r[0]==='ROLE_ORGANIZER'?'users':r[0]==='ROLE_HOSPITAL'?'hospital':r[0]==='ROLE_HOST_VENUE'?'building':'shield')}</span><span><strong>${r[1]}</strong><small>${r[2]}</small></span></label>`).join('')}</fieldset><div class="config-note">${icon('mail','icon-sm')} Invitation delivery requires a configured Resend API key and verified sender domain. Role claims are applied only after the recipient signs in.</div></form>`,
    footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="send-invitation">Send secure invitation</button>` });
}

function editRolesModal(userId) {
  const user = state.adminUsers.find(item=>item.id===userId);
  if (!user) return;
  openModal({ title:'Edit workspace access', subtitle:user.email,
    body:`<form id="roles-form" data-user-id="${user.id}"><fieldset class="role-check-grid"><legend>Active roles</legend>${[['ROLE_DONOR','Donor'],['ROLE_ORGANIZER','Organizer'],['ROLE_HOSPITAL','Hospital'],['ROLE_HOST_VENUE','Host venue'],['ROLE_SUPER_ADMIN','Super Admin']].map(r=>`<label><input type="checkbox" name="roles" value="${r[0]}" ${user.roles.includes(r[0])?'checked':''}><span class="role-option-icon">${icon(r[0]==='ROLE_SUPER_ADMIN'?'shield':'userCheck')}</span><span><strong>${r[1]}</strong><small>${r[0]}</small></span></label>`).join('')}</fieldset></form>`,
    footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-roles">Update permissions</button>` });
}

function createDriveModal() {
  const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,16);
  const end = new Date(Date.now()+86400000+6*3600000).toISOString().slice(0,16);
  openModal({title:'Create donation drive',subtitle:'The drive is created as Planned until operational approval',wide:true,
    body:`<form id="drive-form" class="form-grid"><div class="field full"><label>Drive name</label><input class="input" name="name" required value="Community Blood Drive"></div><div class="field"><label>Venue name</label><input class="input" name="venue_name" required></div><div class="field"><label>Target units</label><input class="input" name="target_units" type="number" min="1" max="1000" value="50" required></div><div class="field full"><label>Full address</label><textarea class="textarea" name="address" required></textarea></div><div class="field"><label>Starts</label><input class="input" name="starts_at" type="datetime-local" value="${tomorrow}" required></div><div class="field"><label>Ends</label><input class="input" name="ends_at" type="datetime-local" value="${end}" required></div></form>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-drive">Create drive</button>`});
}

function hospitalApplicationModal() {
  if (state.hospitalProfile) {
    toast('Application already submitted', `Current status: ${state.hospitalProfile.status}.`, state.hospitalProfile.status==='PENDING'?'warning':'success');
    return;
  }
  openModal({title:'Apply for a hospital account',subtitle:'A Super Admin must verify the facility before any demand can be published',wide:true,
    body:`<form id="hospital-application-form" class="form-grid"><div class="field"><label>Facility name</label><input class="input" name="facility_name" required minlength="3"></div><div class="field"><label>Registration / licence number</label><input class="input" name="registration_number" required minlength="3"></div><div class="field"><label>Institutional email</label><input class="input" name="institutional_email" type="email" value="${escapeHtml(state.account?.email||'')}" required></div><div class="field"><label>Official phone</label><input class="input" name="phone" type="tel" placeholder="+91 98765 43210" required></div><div class="field full"><label>Full address</label><textarea class="textarea" name="address" required></textarea></div><div class="field"><label>City / district</label><input class="input" name="city" required></div><div class="field"><label>State</label><input class="input" name="state" required value="Andhra Pradesh"></div><div class="field"><label>Latitude</label><input class="input" name="latitude" type="number" step="any" min="-90" max="90" required></div><div class="field"><label>Longitude</label><input class="input" name="longitude" type="number" step="any" min="-180" max="180" required></div><div class="field full"><button type="button" class="btn btn-secondary" data-action="fill-location">${icon('navigation','icon-sm')} Use current coordinates</button><span class="field-hint">Coordinates power OpenStreetMap discovery; exact location is shown only after verification.</span></div></form>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-hospital-application">Submit for verification</button>`});
}

function inventoryEventModal() {
  openModal({title:'Record inventory movement',subtitle:'Every receipt, issue, discard, or adjustment is auditable',wide:true,
    body:`<form id="inventory-event-form" class="form-grid"><div class="field"><label>ABO / Rh group</label><select class="select" name="blood_type">${['A+','A-','B+','B-','AB+','AB-','O+','O-','BOMBAY'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Component</label><select class="select" name="component_type">${['PRBC','SDP','RDP','FFP','CRYOPRECIPITATE','WHOLE_BLOOD'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Phenotype code</label><select class="select" name="phenotype_code"><option value="">STANDARD</option>${['BOMBAY_OH','PARA_BOMBAY','RH_NULL','D_VARIANT','KELL_NEGATIVE','DUFFY_NULL','KIDD_NULL','MNS_RARE','VEL_NEGATIVE','OTHER_CONFIRMED'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Movement</label><select class="select" name="event_type"><option>RECEIPT</option><option>ISSUE</option><option>DISCARD</option><option>ADJUSTMENT</option></select></div><div class="field"><label>Adjustment direction</label><select class="select" name="adjustment_direction"><option value="">Not an adjustment</option><option>INCREASE</option><option>DECREASE</option></select></div><div class="field"><label>Units</label><input class="input" name="units" type="number" min="1" max="1000" value="1" required></div><div class="field"><label>Reference</label><input class="input" name="reference" placeholder="GRN, issue, discard or correction ID" required minlength="3"></div><div class="field"><label>Minimum level</label><input class="input" name="minimum_level" type="number" min="0" max="1000" value="2"></div><div class="field full"><label>Reason / note</label><textarea class="textarea" name="reason" placeholder="Required operational context; never enter patient names"></textarea></div></form>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-inventory-event">Record movement</button>`});
}

function editDriveModal() {
  const drive=state.drives.find(item=>item.id===state.activeDriveId); if(!drive)return;
  const local=value=>{const d=new Date(value);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
  openModal({title:'Edit drive',subtitle:'Changes are stored against the organizer-owned record',wide:true,body:`<form id="edit-drive-form" class="form-grid"><div class="field full"><label>Drive name</label><input class="input" name="name" value="${escapeHtml(drive.name)}" required></div><div class="field"><label>Venue</label><input class="input" name="venue_name" value="${escapeHtml(drive.venue_name||'')}" required></div><div class="field"><label>Target units</label><input class="input" name="target_units" type="number" min="1" max="1000" value="${drive.target_units}" required></div><div class="field full"><label>Address</label><textarea class="textarea" name="address" required>${escapeHtml(drive.address||'')}</textarea></div><div class="field"><label>Starts</label><input class="input" name="starts_at" type="datetime-local" value="${local(drive.starts_at)}" required></div><div class="field"><label>Ends</label><input class="input" name="ends_at" type="datetime-local" value="${local(drive.ends_at)}" required></div></form>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-drive-edit">Save changes</button>`});
}

function createProposalModal() {
  const tomorrow=new Date(Date.now()+7*86400000).toISOString().slice(0,16);const end=new Date(Date.now()+7*86400000+6*3600000).toISOString().slice(0,16);
  openModal({title:'Propose a hosted donation drive',subtitle:'The host receives a persistent, actionable proposal',wide:true,body:`<form id="proposal-form" class="form-grid"><div class="field"><label>Host account email</label><input class="input" name="host_email" type="email" required></div><div class="field"><label>Proposed drive name</label><input class="input" name="proposed_name" required value="Community Blood Drive"></div><div class="field"><label>Venue name</label><input class="input" name="venue_name" required></div><div class="field"><label>Target units</label><input class="input" name="target_units" type="number" min="1" max="1000" value="50" required></div><div class="field full"><label>Address</label><textarea class="textarea" name="address" required></textarea></div><div class="field"><label>Starts</label><input class="input" name="starts_at" type="datetime-local" value="${tomorrow}" required></div><div class="field"><label>Ends</label><input class="input" name="ends_at" type="datetime-local" value="${end}" required></div><div class="field"><label>Recovery seats</label><input class="input" name="recovery_seats" type="number" min="1" max="500" value="30"></div><fieldset class="field full"><label><input type="checkbox" name="power_available" checked> Protected power</label><label><input type="checkbox" name="wifi_available" checked> Staff Wi-Fi</label><label><input type="checkbox" name="parking_available" checked> Loading / parking</label><label><input type="checkbox" name="privacy_partitions" checked> Privacy partitions</label></fieldset></form>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-proposal">Send proposal</button>`});
}

async function openQrPass() {
  if (state.authenticated && !state.donorProfile) {
    toast('Profile required', 'Complete your donor profile before generating a pass.', 'warning');
    donorProfileModal();
    return;
  }
  let issued = null;
  if (state.authenticated) {
    openModal({ title:'Preparing secure pass', body:`<div class="empty-state"><span class="empty-icon">${icon('refresh')}</span><h3>Requesting a signed rotating token</h3><p>The pass is bound to your current screening and account.</p></div>` });
    try { issued = await apiFetch('/donors/me/pass'); }
    catch (error) { closeModal(); toast('Pass unavailable', error.message, 'warning'); return; }
  }
  openModal({
    title: 'Dynamic donor pass', subtitle: state.authenticated ? 'Signed by RaktFlow · expires every 30 seconds' : 'Product demo · not valid for real intake',
    body: `<div class="qr-pass"><div class="qr-brand"><span class="brand-mark" style="width:28px;height:31px">${icon('activity','icon-sm')}</span>RaktFlow ${state.authenticated?'signed':'demo'} pass</div><div class="qr-frame"><canvas id="pass-qr" aria-label="Rotating donor QR code"></canvas></div><div class="rotating-code" id="rotating-code">${issued?.rotating_code ? `${issued.rotating_code.slice(0,3)} ${issued.rotating_code.slice(3)}` : '482 109'}</div><div class="token-progress"><span></span></div><div class="secure-note">${icon('lock','icon-sm')} QR contains a signed opaque identifier—not your phone or health history</div><span class="offline-chip">${icon('shield','icon-sm')} Organizer authentication required to read intake details</span></div>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">Close</button><button class="btn btn-primary" data-action="screening">Update pre-check</button>`,
    onOpen: () => {
      let stopped = false;
      const renderToken = async (payload) => {
        if (stopped || !document.querySelector('#pass-qr')) return;
        const token = payload?.token || `${Math.floor(Date.now()/30000)}:RF-DEMO:demo-only`;
        await QRCode.toCanvas(document.querySelector('#pass-qr'), token, { width:230, margin:1, color:{dark:'#0f172a',light:'#ffffff'}, errorCorrectionLevel:'H' });
        if (payload?.rotating_code) document.querySelector('#rotating-code').textContent = `${payload.rotating_code.slice(0,3)} ${payload.rotating_code.slice(3)}`;
      };
      renderToken(issued);
      const interval = setInterval(async () => {
        if (!state.authenticated) return renderToken(null);
        try { issued = await apiFetch('/donors/me/pass'); await renderToken(issued); } catch { /* current visual token expires safely */ }
      }, 30000);
      return () => { stopped = true; clearInterval(interval); };
    }
  });
}

function hash(value) { let h = 0; for (let i=0;i<value.length;i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0; return h; }

function screeningModal() {
  openModal({
    title: 'India-focused donor pre-check',
    subtitle: 'Self-attestation helps route the on-site review; it never clears you to donate',
    wide: true,
    body: `<form id="screening-form" class="screening-form">
      <div class="screening-notice">${icon('shield')}<span><strong>Answer privately and honestly.</strong><small>Qualified staff will still verify identity, donation interval, hemoglobin, vital signs, and confidential history at the venue.</small></span></div>
      <section><span class="section-label">Basic eligibility context</span><div class="form-grid"><div class="field"><label for="screen-weight">Current weight (kg)</label><input class="input" id="screen-weight" name="weight_kg" type="number" min="25" max="250" step="0.1" required></div><div class="field"><label for="screen-last-donation">Last blood donation, if any</label><input class="input" id="screen-last-donation" name="last_donation_date" type="date"></div></div></section>
      <section><span class="section-label">Current health</span><div class="question-list">
        ${screeningQuestion('feeling_well_today','Are you feeling well today?','Fever, weakness, active illness, or feeling unwell must be reviewed.',true)}
        ${screeningQuestion('fever_infection_or_antibiotics','Do you currently have fever/infection or take antibiotics?','Do not stop prescribed medicine in order to donate.')}
        ${screeningQuestion('medication_requires_review','Are you taking any medicine that staff should review?','Include blood thinners and medicines started recently.')}
        ${screeningQuestion('heart_lung_kidney_liver_or_bleeding_condition','Have you been diagnosed with a heart, lung, kidney, liver, or bleeding condition?','A confidential clinician review determines relevance.')}
      </div></section>
      <section><span class="section-label">Recent history</span><div class="question-list">
        ${screeningQuestion('surgery_transfusion_or_hospitalization_last_12_months','Surgery, transfusion, or hospitalization in the last 12 months?','Time windows vary; staff will verify the applicable policy.')}
        ${screeningQuestion('tattoo_or_piercing_last_12_months','Tattoo or piercing in the last 12 months?','This may require a temporary waiting period.')}
        ${screeningQuestion('malaria_risk_travel_or_residence','Recent residence or travel in an area with malaria risk?','Share location details confidentially with clinical staff.')}
        ${screeningQuestion('pregnancy_breastfeeding_or_recent_delivery','Pregnancy, breastfeeding, or recent delivery requiring review?','Choose Not applicable if this does not apply.',false,true)}
      </div></section>
      <section class="attestation-block"><label><input type="checkbox" name="answers_are_truthful" required><span><strong>I confirm these answers are truthful to the best of my knowledge.</strong><small>Incorrect information can harm the donor or recipient.</small></span></label><label><input type="checkbox" name="consent_to_clinical_review" required><span><strong>I consent to confidential on-site clinical review.</strong><small>The organizer sees only intake status; detailed answers remain clinically restricted.</small></span></label></section>
    </form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-screening">Submit encrypted pre-check</button>`
  });
}

function screeningQuestion(name, title, note, yesIsSafe = false, nullable = false) {
  return `<div class="screening-question"><span><strong>${title}</strong><small>${note}</small></span><select class="select" name="${name}" data-safe-answer="${yesIsSafe}" required><option value="">Select</option><option value="true">Yes</option><option value="false">No</option>${nullable?'<option value="null">Not applicable</option>':''}</select></div>`;
}

function screeningResultModal(result) {
  const good = result.outcome === 'PROCEED_TO_CLINICAL';
  openModal({title:'Pre-check recorded',subtitle:'This result is not medical clearance',body:`<div class="clearance-result ${good?'':'review-result'}"><span class="clearance-icon">${icon(good?'check':'alert','icon-lg')}</span><h3>${result.outcome.replaceAll('_',' ')}</h3><p>${result.message}</p></div>${result.flags?.length?`<div style="margin-top:14px"><span class="section-label">Private review flags</span><div style="display:flex;gap:6px;flex-wrap:wrap">${result.flags.map(f=>`<span class="badge badge-amber">${f.replaceAll('_',' ')}</span>`).join('')}</div></div>`:''}`,footer:`<button class="btn btn-secondary" data-action="close-modal">Done</button><button class="btn btn-primary" data-action="open-pass">Generate donor pass</button>`});
}

function requestModal() {
  openModal({ title:'Emergency requisition builder', subtitle:'The signed document stays encrypted; publishing requires explicit clinical checks', wide:true,
    body:`<form class="form-grid" id="request-form"><div class="field"><label for="patient-id">Patient reference ID</label><input class="input" id="patient-id" name="patient_reference" placeholder="Hospital MRN—not patient name" required minlength="3"></div><div class="field"><label for="blood-type">ABO / Rh requirement</label><select class="select" id="blood-type" name="blood_type">${['O-','O+','A-','A+','B-','B+','AB-','AB+','BOMBAY'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label for="phenotype">Confirmed rare phenotype (if applicable)</label><select class="select" id="phenotype" name="phenotype_code"><option value="">Standard ABO/Rh requirement</option>${['BOMBAY_OH','PARA_BOMBAY','RH_NULL','D_VARIANT','KELL_NEGATIVE','DUFFY_NULL','KIDD_NULL','MNS_RARE','VEL_NEGATIVE','OTHER_CONFIRMED'].map(x=>`<option>${x}</option>`).join('')}</select><span class="field-hint">Use only a blood-bank-confirmed phenotype or antigen requirement.</span></div><div class="field"><label for="component">Component</label><select class="select" id="component" name="component_type">${['PRBC','SDP','RDP','FFP','CRYOPRECIPITATE','WHOLE_BLOOD'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label for="units">Units required</label><input class="input" id="units" name="units_needed" type="number" min="1" max="20" value="2" required></div><div class="field"><label for="urgency">Urgency</label><select class="select" id="urgency" name="urgency"><option>HIGH</option><option>RARE_STANDBY</option><option>MEDIUM</option><option>LOW</option><option>CRITICAL_PPH</option></select></div><div class="field"><label for="expires">Alert validity</label><select class="select" id="expires" name="expires_in_hours"><option value="6">6 hours</option><option value="8" selected>8 hours</option><option value="10">10 hours</option><option value="12">12 hours</option></select></div><div class="field full"><label>Doctor-signed requisition</label><label class="upload-desk" for="slip"><input id="slip" name="slip" type="file" accept="image/jpeg,image/png,application/pdf" hidden required><span><span class="upload-icon">${icon('upload')}</span><strong>Choose signed PDF, JPG, or PNG</strong><span>Encrypted before durable PostgreSQL storage · max 10 MB</span></span></label></div><div class="field full"><div class="config-note">${icon('shield','icon-sm')} Uploading creates no donor alert. The request starts Pending and must pass physician-registration and component confirmation.</div></div></form>`,
    footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-request">Upload and create pending request</button>` });
}

function pphModal() {
  const eligible=state.hospitalRequests.filter(item=>item.status==='VERIFIED'&&item.urgency==='CRITICAL_PPH');
  openModal({ title:'Confirm PPH emergency bridge', subtitle:'Protected, audited action linked to a verified demand',
    body:`<form id="pph-form"><div class="config-warning">${icon('alert','icon-sm')} This coordinates logistics. It does not authorize transfusion or override compatibility checks.</div><div class="form-grid" style="margin-top:15px"><div class="field full"><label>Linked verified CRITICAL_PPH request</label><select class="select" name="request_id" required><option value="">Select request</option>${eligible.map(item=>`<option value="${item.id}">${escapeHtml(item.blood_type)} · ${escapeHtml(item.component_type)} · ${item.units_needed} units</option>`).join('')}</select></div><div class="field"><label>Ward / delivery room</label><input class="input" name="ward" required></div><div class="field"><label>Clinical owner registration</label><input class="input" name="clinical_owner_registration" required></div></div><label class="consent-row" style="margin-top:15px"><input type="checkbox" name="authorization_confirmed" required><span>I confirm clinical authorization and that the blood bank has been contacted.</span></label></form>${eligible.length?'':'<p class="muted">Create and clinically verify a CRITICAL_PPH requisition first.</p>'}`,
    footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="activate-pph" ${eligible.length?'':'disabled'}>${icon('ambulance','icon-sm')} Activate audited dispatch</button>` });
}

function rarePagerModal() {
  const eligible=state.hospitalRequests.filter(item=>item.status==='VERIFIED'&&item.urgency==='RARE_STANDBY');
  openModal({ title:'Rare blood standby pager', subtitle:'Targeted micro-tier dispatch; no city-wide broadcast',
    body:`<form id="rare-pager-form" class="form-grid"><div class="field full"><label>Linked verified RARE_STANDBY request</label><select class="select" name="request_id" required><option value="">Select request</option>${eligible.map(item=>`<option value="${item.id}">${escapeHtml(item.blood_type)} · ${escapeHtml(item.phenotype_code||'standard')} · ${item.units_needed} units</option>`).join('')}</select></div><div class="field"><label>Initial radius</label><input class="input" value="15 km" disabled></div><div class="field"><label>First cohort</label><select class="select" name="cohort_size"><option>3</option><option>4</option><option selected>5</option></select></div></form><div class="config-note">${icon('shield','icon-sm')} Only current, opted-in, phenotype-compatible donors are selected. Expand only after the first response window.</div>${eligible.length?'':'<p class="muted">Create and clinically verify a RARE_STANDBY request first.</p>'}`,
    footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="send-rare-alert" ${eligible.length?'':'disabled'}>Send targeted pager</button>` });
}

function proposalModal() {
  openModal({ title:'Red Cross Coastal Chapter', subtitle:'Drive proposal · 28 August 2026', wide:true,
    body:`<div class="grid grid-3 metric-grid-mobile">${metric('droplet','80','Target units')}${metric('users','12','Clinical staff')}${metric('clock','6 h','Drive window')}</div><div class="grid grid-2" style="margin-top:16px"><div><span class="section-label">Facility request</span><div class="activity-list"><div class="activity-item"><span class="activity-icon">${icon('building')}</span><span class="activity-copy"><strong>Main auditorium</strong><span>Minimum 185 m² clinical zone</span></span></div><div class="activity-item"><span class="activity-icon">${icon('zap')}</span><span class="activity-copy"><strong>4 protected power points</strong><span>Backup supply preferred</span></span></div><div class="activity-item"><span class="activity-icon">${icon('truck')}</span><span class="activity-copy"><strong>Ambulance access</strong><span>Loading bay for mobile cold chain</span></span></div></div></div><div><span class="section-label">Organizer assurance</span><p class="muted" style="font-size:11px">Medical license, insurance, staff roster, and collection authorization are verified through 31 December 2026.</p><span class="badge badge-green">Credentials current</span></div></div>`,
    footer:`<button class="btn btn-danger-soft" data-action="decline-proposal">Decline</button><button class="btn btn-secondary" data-action="request-changes">Request changes</button><button class="btn btn-primary" data-action="approve-proposal">Approve venue</button>` });
}

function notificationsModal() {
  const alerts=state.donorAlerts.length?state.donorAlerts:state.publicRequests;
  openModal({title:'Verified operational alerts',subtitle:'Live data refreshes every 30 seconds while RaktFlow is open',body:`<div class="activity-list">${alerts.slice(0,8).map(item=>`<div class="activity-item"><span class="activity-icon">${icon('alert')}</span><span class="activity-copy"><strong>${escapeHtml(item.blood_type)} · ${escapeHtml(item.component_type)}</strong><span>${escapeHtml(item.facility_name)} · expires ${new Date(item.expires_at).toLocaleString()}</span></span></div>`).join('')||'<p class="muted">No verified alert is active.</p>'}</div><div class="config-note">${icon('shield','icon-sm')} Browser notifications contain no patient identity or clinical document.</div>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Close</button><button class="btn btn-primary" data-action="enable-notifications">Enable browser alerts</button>`});
}
async function enableNotifications(){if(!('Notification'in window)){toast('Notifications unsupported','This browser does not expose the Notifications API.','warning');return;}const permission=await Notification.requestPermission();if(permission==='granted'){closeModal();toast('Live alerts enabled','New verified requests can notify you while this app is open.');}else{toast('Permission not granted','You can still review verified alerts inside RaktFlow.','warning');}}

function toast(title, message, type='success') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-icon">${icon(type==='success'?'check':'alert','icon-sm')}</span><span><strong>${title}</strong><span>${message}</span></span>`;
  toastRegion.append(el);
  setTimeout(() => el.remove(), 4200);
}

function warmApi() { if (isApiConfigured()) prewarmApi(); }

async function copyCampaignLink() {
  const value = document.querySelector('#campaign-link')?.value || 'https://raktflow.org/drives/harbortech-aug26';
  try { await navigator.clipboard.writeText(value); } catch { /* clipboard may be blocked in preview */ }
  toast('Link copied', 'Co-branded registration URL is ready to share.');
}

function enterDemo() {
  closeModal();
  state.demoMode = true;
  state.authenticated = false;
  state.allowedRoles = Object.values(roleConfig).map(item=>item.claim);
  state.role = 'donor'; state.view = roleConfig.donor.landing; state.screen = 'app';
  render();
  toast('Product demo','Demo data is clearly separated from real authenticated records.');
}

async function bootstrapSession(user) {
  state.loading = true;
  try {
    const account = await apiFetch('/auth/bootstrap', {method:'POST', body:'{}'});
    await user.getIdToken(true);
    state.authUser = user; state.authenticated = true; state.demoMode = false; state.account = account;
    state.allowedRoles = account.roles;
    const allowed = availableRoleEntries();
    const saved = allowed.find(([key])=>key===state.role);
    state.role = saved?.[0] || allowed[0]?.[0] || 'donor';
    state.view = roleConfig[state.role].landing; state.screen = 'app';
    await Promise.allSettled([loadDonorProfile(false), loadDonorOperations(false), loadMyDrives(false), loadHospitalData(false), loadProposals(false), loadPublicData(false)]);
    render();
    if (account.needs_profile && account.roles.includes('ROLE_DONOR')) donorProfileModal();
    if (account.roles.includes('ROLE_SUPER_ADMIN')) loadAdminData(false);
  } catch (error) {
    state.screen='landing'; render(); toast('Account setup failed', error.message, 'warning');
  } finally { state.loading=false; }
}

async function loadDonorProfile(shouldRender=true) {
  if (!state.authenticated || !state.allowedRoles.includes('ROLE_DONOR')) return;
  try { state.donorProfile = await apiFetch('/donors/me/profile'); }
  catch (error) { if (!error.message.toLowerCase().includes('not complete')) console.warn(error); }
  if (shouldRender) render();
}

async function loadAdminData(shouldRender=true) {
  if (!state.authenticated || !state.allowedRoles.includes('ROLE_SUPER_ADMIN')) return;
  try {
    [state.adminUsers,state.invitations,state.hospitalApplications,state.adminDrives] = await Promise.all([apiFetch('/admin/users'),apiFetch('/admin/invitations'),apiFetch('/hospitals/applications'),apiFetch('/drives/mine')]);
    if (shouldRender) render();
  } catch (error) { toast('Admin data unavailable',error.message,'warning'); }
}

async function loadPublicData(shouldRender=true) {
  if (!isApiConfigured()) return;
  try {
    const [requests, centres, drives] = await Promise.all([
      publicApiFetch('/public/requests'), publicApiFetch('/public/centres'), publicApiFetch('/drives/public')
    ]);
    const newAlerts=requests.filter(item=>state.knownRequestIds.size&& !state.knownRequestIds.has(item.id));
    state.publicRequests=requests; state.publicCentres=centres; state.publicDrives=drives;
    state.knownRequestIds=new Set(requests.map(item=>item.id));
    if (newAlerts.length && 'Notification' in window && Notification.permission==='granted') {
      const item=newAlerts[0]; new Notification(`Verified ${item.blood_type} blood need`,{body:`${item.facility_name} · ${item.units_needed} ${item.component_type} unit(s)`,icon:'/icons/icon-192.svg'});
    }
    if (shouldRender) render();
  } catch (error) { console.warn('Public operational data unavailable', error); }
}

async function loadDonorOperations(shouldRender=true) {
  if (!state.authenticated || !state.allowedRoles.includes('ROLE_DONOR')) return;
  try {
    [state.donationHistory, state.donorAlerts] = await Promise.all([
      apiFetch('/donors/me/donations'), apiFetch('/donors/me/alerts')
    ]);
    if (shouldRender) render();
  } catch (error) { console.warn('Donor operational data unavailable', error); }
}

async function loadMyDrives(shouldRender=true) {
  if (!state.authenticated || !(state.allowedRoles.includes('ROLE_ORGANIZER')||state.allowedRoles.includes('ROLE_SUPER_ADMIN'))) return;
  try {
    state.drives=await apiFetch('/drives/mine');
    state.activeDriveId=state.drives.some(item=>item.id===state.activeDriveId) ? state.activeDriveId : state.drives[0]?.id||null;
    if (state.activeDriveId) await loadDriveAnalytics(false);
    if(shouldRender)render();
  } catch(error){ console.warn(error); }
}

async function loadDriveAnalytics(shouldRender=true) {
  if (!state.activeDriveId || state.demoMode) return;
  try { state.driveAnalytics = await apiFetch(`/drives/${state.activeDriveId}/analytics`); if (shouldRender) render(); }
  catch(error) { state.driveAnalytics=null; console.warn(error); }
}

async function loadHospitalData(shouldRender=true) {
  if (!state.authenticated) return;
  try { state.hospitalProfile=await apiFetch('/hospitals/me'); } catch(error) { state.hospitalProfile=null; }
  if (state.hospitalProfile?.status === 'VERIFIED') {
    const results = await Promise.allSettled([apiFetch('/hospitals/inventory/me'), apiFetch('/requests/mine')]);
    if (results[0].status === 'fulfilled') state.hospitalInventory=results[0].value;
    if (results[1].status === 'fulfilled') state.hospitalRequests=results[1].value;
  }
  if (shouldRender) render();
}

async function loadProposals(shouldRender=true) {
  if (!state.authenticated || !state.allowedRoles.some(role=>['ROLE_ORGANIZER','ROLE_HOST_VENUE','ROLE_SUPER_ADMIN'].includes(role))) return;
  try {
    state.proposals=await apiFetch('/drives/proposals/mine');
    if (state.allowedRoles.includes('ROLE_HOST_VENUE')) {
      const linked=state.proposals.find(item=>item.resulting_drive_id);
      if (linked) { try { state.driveAnalytics=await apiFetch(`/drives/${linked.resulting_drive_id}/analytics`); } catch { /* not yet reportable */ } }
    }
    if(shouldRender)render();
  }
  catch(error){ console.warn(error); }
}

async function submitMagicLink() {
  const form=document.querySelector('#auth-form'); if(!form?.reportValidity()) return;
  const email=document.querySelector('#auth-email').value.trim().toLowerCase();
  try { await sendMagicLink(email); closeModal(); toast('Check your email',`A secure sign-in link was sent to ${email}.`); }
  catch(error){ toast('Could not send sign-in link',error.message,'warning'); }
}

async function saveDonorProfile() {
  const form=document.querySelector('#donor-profile-form'); if(!form?.reportValidity()) return;
  const data=new FormData(form);
  const payload={full_name:data.get('full_name'),date_of_birth:data.get('date_of_birth'),phone:data.get('phone'),city:data.get('city'),blood_type:data.get('blood_type'),consent_to_process:document.querySelector('#profile-consent').checked,emergency_notifications:false};
  try { state.donorProfile=await apiFetch('/donors/me/profile',{method:'PUT',body:JSON.stringify(payload)}); closeModal(); render(); toast('Profile saved','Your encrypted donor record is ready for pre-screening.'); }
  catch(error){ toast('Profile not saved',error.message,'warning'); }
}

function parseBoolean(value){ return value==='null'?null:value==='true'; }
async function submitScreeningForm() {
  const form=document.querySelector('#screening-form'); if(!form?.reportValidity()) return;
  const data=new FormData(form);
  const fields=['feeling_well_today','fever_infection_or_antibiotics','medication_requires_review','heart_lung_kidney_liver_or_bleeding_condition','surgery_transfusion_or_hospitalization_last_12_months','tattoo_or_piercing_last_12_months','malaria_risk_travel_or_residence','pregnancy_breastfeeding_or_recent_delivery'];
  const payload={questionnaire_version:'IN-PRECHECK-2026-01',weight_kg:Number(data.get('weight_kg')),last_donation_date:data.get('last_donation_date')||null,answers_are_truthful:data.has('answers_are_truthful'),consent_to_clinical_review:data.has('consent_to_clinical_review')};
  fields.forEach(name=>payload[name]=parseBoolean(data.get(name)));
  if(state.demoMode){ screeningResultModal({outcome:'PROCEED_TO_CLINICAL',flags:[],message:'Demo pre-check complete. A real deployment still requires on-site clinical confirmation.'}); return; }
  try { const result=await apiFetch('/donors/me/screenings',{method:'POST',body:JSON.stringify(payload)}); await loadDonorProfile(false); screeningResultModal(result); }
  catch(error){ toast('Pre-check not submitted',error.message,'warning'); }
}

async function sendInvitationForm() {
  const form=document.querySelector('#invite-form'); if(!form?.reportValidity()) return;
  const data=new FormData(form); const roles=data.getAll('roles');
  if(!roles.length){ toast('Select at least one role','No access is granted without an explicit role.','warning'); return; }
  try { const result=await apiFetch('/admin/invitations',{method:'POST',body:JSON.stringify({email:data.get('email'),roles})}); closeModal(); await loadAdminData(); toast(result.delivery==='SENT'?'Invitation sent':'Invitation recorded',result.delivery==='SENT'?'The recipient can accept through their email.':`Email delivery status: ${result.delivery}`); }
  catch(error){ toast('Invitation failed',error.message,'warning'); }
}

async function saveRolesForm() {
  const form=document.querySelector('#roles-form'); const data=new FormData(form); const roles=data.getAll('roles');
  if(!roles.length){ toast('At least one role required','Disable the account instead of leaving it roleless.','warning'); return; }
  try { await apiFetch(`/admin/users/${form.dataset.userId}/roles`,{method:'PUT',body:JSON.stringify({roles})}); closeModal(); await loadAdminData(); toast('Permissions updated','The user must refresh their sign-in token.'); }
  catch(error){ toast('Role update failed',error.message,'warning'); }
}

async function saveDriveForm() {
  const form=document.querySelector('#drive-form'); if(!form?.reportValidity())return; const data=new FormData(form);
  const payload={name:data.get('name'),venue_name:data.get('venue_name'),address:data.get('address'),target_units:Number(data.get('target_units')),starts_at:new Date(data.get('starts_at')).toISOString(),ends_at:new Date(data.get('ends_at')).toISOString(),latitude:null,longitude:null};
  try { const drive=await apiFetch('/drives',{method:'POST',body:JSON.stringify(payload)}); closeModal(); await loadMyDrives(false); state.activeDriveId=drive.id; state.view='scanner'; render(); toast('Drive created','QR and manual check-in are now linked to this drive.'); }
  catch(error){ toast('Drive not created',error.message,'warning'); }
}

async function processScannedToken(token) {
  if(!state.activeDriveId){toast('Drive required','Choose or create a drive first.','warning');return;}
  try { state.intakeDonor=await apiFetch('/intake/scan',{method:'POST',body:JSON.stringify({drive_id:state.activeDriveId,pass_token:token,idempotency_key:crypto.randomUUID()})}); closeModal(); render(); toast('Donor checked in',`${state.intakeDonor.display_name} was registered automatically.`); }
  catch(error){ toast('Pass rejected',error.message,'warning'); }
}

async function startQrCamera() {
  const { BrowserQRCodeReader } = await import('@zxing/browser');
  openModal({title:'Scan rotating donor pass',subtitle:'Camera frames stay on this device; only a decoded signed token is submitted',body:`<video id="qr-video" style="width:100%;min-height:320px;border-radius:14px;background:#020617" playsinline></video><p class="muted" style="font-size:11px;text-align:center">Hold the donor QR inside the frame. The camera stops immediately after a valid read.</p>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel scan</button>`,onOpen:()=>{let controls;let stopped=false;const reader=new BrowserQRCodeReader();reader.decodeFromVideoDevice(undefined,document.querySelector('#qr-video'),(result)=>{if(result&&!stopped){stopped=true;controls?.stop();processScannedToken(result.getText());}}).then(value=>controls=value).catch(error=>toast('Camera unavailable',error.message,'warning'));return()=>{stopped=true;controls?.stop();reader.reset?.();};}});
}

function pasteTokenModal(){openModal({title:'Paste donor pass token',subtitle:'Fallback for testing or supported external scanners',body:`<div class="field"><label for="pasted-token">Signed QR content</label><textarea class="textarea" id="pasted-token" rows="7" required></textarea></div>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-pasted-token">Check in donor</button>`});}

async function submitManualCheckin(){const ref=document.querySelector('#manual-lookup')?.value.trim().toUpperCase();if(!ref){toast('Reference required','Enter the donor reference shown in their profile.','warning');return;}try{state.intakeDonor=await apiFetch('/intake/manual',{method:'POST',body:JSON.stringify({drive_id:state.activeDriveId,donor_reference:ref,idempotency_key:crypto.randomUUID()})});render();toast('Manual check-in recorded',`${state.intakeDonor.display_name} was registered with an audited fallback.`);}catch(error){toast('Check-in failed',error.message,'warning');}}

function clinicalAssessmentModal(){if(!state.intakeDonor)return;openModal({title:'Record clinical assessment',subtitle:'Qualified staff only · measurements are encrypted',body:`<form id="assessment-form" class="form-grid"><div class="field"><label>Decision</label><select class="select" name="decision"><option>CLEARED</option><option>DEFERRED</option></select></div><div class="field"><label>Reason codes if deferred</label><input class="input" name="reason_codes" placeholder="LOW_HB, BP_REVIEW"></div><div class="field"><label>Hemoglobin g/dL</label><input class="input" name="hemoglobin_g_dl" type="number" step="0.1" min="2" max="25"></div><div class="field"><label>Pulse bpm</label><input class="input" name="pulse_bpm" type="number" min="30" max="220"></div><div class="field"><label>Systolic BP</label><input class="input" name="systolic_bp" type="number"></div><div class="field"><label>Diastolic BP</label><input class="input" name="diastolic_bp" type="number"></div></form>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-assessment">Record audited decision</button>`});}

async function submitAssessment(){const form=document.querySelector('#assessment-form');const d=new FormData(form);const num=name=>d.get(name)?Number(d.get(name)):null;const payload={decision:d.get('decision'),reason_codes:d.get('reason_codes')?String(d.get('reason_codes')).split(',').map(x=>x.trim()).filter(Boolean):[],hemoglobin_g_dl:num('hemoglobin_g_dl'),pulse_bpm:num('pulse_bpm'),systolic_bp:num('systolic_bp'),diastolic_bp:num('diastolic_bp')};try{await apiFetch(`/intake/${state.intakeDonor.checkin_id}/assessment`,{method:'POST',body:JSON.stringify(payload)});state.intakeDonor.clearance_status=payload.decision;closeModal();render();toast('Clinical decision recorded',payload.decision==='CLEARED'?'Collection recording is now enabled.':'The donor was confidentially deferred.');}catch(error){toast('Assessment failed',error.message,'warning');}}

function donationRecordModal(){if(!state.intakeDonor)return;openModal({title:'Record collected unit',subtitle:`${state.intakeDonor.display_name} · ${state.intakeDonor.donor_reference}`,body:`<form id="donation-form" class="form-grid"><div class="field"><label>Unit reference</label><input class="input" name="unit_reference" required placeholder="WB-2026-0001"></div><div class="field"><label>Component</label><select class="select" name="component_type"><option>WHOLE_BLOOD</option><option>PRBC</option><option>SDP</option><option>FFP</option></select></div><div class="field"><label>Confirmed blood type</label><select class="select" name="blood_type_at_collection">${['A+','A-','B+','B-','AB+','AB-','O+','O-','BOMBAY'].map(x=>`<option ${x===state.intakeDonor.blood_type?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Volume mL</label><input class="input" name="volume_ml" type="number" min="50" max="1000" value="450"></div></form>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-donation">Log collection</button>`});}

async function submitDonation(){const form=document.querySelector('#donation-form');if(!form?.reportValidity())return;const d=new FormData(form);const payload={unit_reference:d.get('unit_reference'),component_type:d.get('component_type'),blood_type_at_collection:d.get('blood_type_at_collection'),volume_ml:Number(d.get('volume_ml'))||null,collected_at:new Date().toISOString()};try{const result=await apiFetch(`/intake/${state.intakeDonor.checkin_id}/donation`,{method:'POST',body:JSON.stringify(payload)});closeModal();toast('Donation recorded',`Unit ${result.unit_reference} is linked to the donor and drive.`);}catch(error){toast('Collection not recorded',error.message,'warning');}}

async function submitHospitalApplication() {
  const form=document.querySelector('#hospital-application-form'); if(!form?.reportValidity())return; const d=new FormData(form);
  const payload={facility_name:d.get('facility_name'),registration_number:d.get('registration_number'),institutional_email:d.get('institutional_email'),phone:d.get('phone'),address:d.get('address'),city:d.get('city'),state:d.get('state'),latitude:Number(d.get('latitude')),longitude:Number(d.get('longitude'))};
  try { state.hospitalProfile=await apiFetch('/hospitals/applications',{method:'POST',body:JSON.stringify(payload)}); closeModal(); render(); toast('Application submitted','Publishing stays locked until Super Admin verification.'); }
  catch(error){toast('Application not submitted',error.message,'warning');}
}

async function submitInventoryEvent() {
  const form=document.querySelector('#inventory-event-form');if(!form?.reportValidity())return;const d=new FormData(form);
  const payload={blood_type:d.get('blood_type'),phenotype_code:d.get('phenotype_code')||null,component_type:d.get('component_type'),event_type:d.get('event_type'),adjustment_direction:d.get('adjustment_direction')||null,units:Number(d.get('units')),reference:d.get('reference'),reason:d.get('reason')||'',minimum_level:d.get('minimum_level')===''?null:Number(d.get('minimum_level'))};
  try{const result=await apiFetch('/hospitals/inventory/events',{method:'POST',body:JSON.stringify(payload)});closeModal();await loadHospitalData();toast('Inventory recorded',`Resulting balance: ${result.resulting_units} units.`);}catch(error){toast('Inventory not updated',error.message,'warning');}
}

async function saveDriveEdit() {
  const form=document.querySelector('#edit-drive-form');if(!form?.reportValidity())return;const d=new FormData(form);
  const payload={name:d.get('name'),venue_name:d.get('venue_name'),address:d.get('address'),target_units:Number(d.get('target_units')),starts_at:new Date(d.get('starts_at')).toISOString(),ends_at:new Date(d.get('ends_at')).toISOString()};
  try{await apiFetch(`/drives/${state.activeDriveId}`,{method:'PATCH',body:JSON.stringify(payload)});closeModal();await loadMyDrives();toast('Drive updated','The operational schedule is current.');}catch(error){toast('Drive not updated',error.message,'warning');}
}

async function submitProposal() {
  const form=document.querySelector('#proposal-form');if(!form?.reportValidity())return;const d=new FormData(form);
  const payload={host_email:d.get('host_email'),proposed_name:d.get('proposed_name'),venue_name:d.get('venue_name'),address:d.get('address'),starts_at:new Date(d.get('starts_at')).toISOString(),ends_at:new Date(d.get('ends_at')).toISOString(),target_units:Number(d.get('target_units')),recovery_seats:Number(d.get('recovery_seats')),power_available:d.has('power_available'),wifi_available:d.has('wifi_available'),parking_available:d.has('parking_available'),privacy_partitions:d.has('privacy_partitions')};
  try{await apiFetch('/drives/proposals',{method:'POST',body:JSON.stringify(payload)});closeModal();await loadProposals();toast('Proposal sent','The named host account can review and approve it.');}catch(error){toast('Proposal not sent',error.message,'warning');}
}

async function submitBloodRequest() {
  const form=document.querySelector('#request-form');if(!form?.reportValidity())return;const d=new FormData(form);const file=d.get('slip');
  const upload=new FormData();upload.append('upload',file);
  try{
    const document=await apiFetch('/requests/documents',{method:'POST',body:upload});
    const payload={patient_reference:d.get('patient_reference'),blood_type:d.get('blood_type'),phenotype_code:d.get('phenotype_code')||null,component_type:d.get('component_type'),units_needed:Number(d.get('units_needed')),urgency:d.get('urgency'),expires_in_hours:Number(d.get('expires_in_hours')),latitude:null,longitude:null,document_object_key:document.object_key,document_sha256_hex:document.sha256};
    await apiFetch('/requests',{method:'POST',body:JSON.stringify(payload)});closeModal();await loadHospitalData();state.view='requisitions';render();toast('Pending requisition created','Complete the clinical verification before any public or donor alert appears.');
  }catch(error){toast('Requisition not created',error.message,'warning');}
}

async function verifyBloodRequest(requestId) {
  try{await apiFetch(`/requests/${requestId}/verify`,{method:'POST',body:JSON.stringify({decision:'VERIFIED',reason_code:'CLINICAL_REVIEW_CONFIRMED',physician_registration_confirmed:true,component_confirmed:true})});await loadHospitalData();toast('Demand published','The verified facility and time-bound need are now visible.');}catch(error){toast('Verification failed',error.message,'warning');}
}

function resolveRequestModal(requestId){openModal({title:'Resolve blood demand',subtitle:'Resolving revokes active alerts',body:`<form id="resolve-request-form" data-request-id="${requestId}" class="form-grid"><div class="field full"><label>Receiving event / issue reference</label><input class="input" name="receiving_event_id" required minlength="8"></div><div class="field"><label>Units received</label><input class="input" name="units_received" type="number" min="1" max="20" value="1" required></div></form>`,footer:`<button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-resolve-request">Resolve and revoke alerts</button>`});}
async function submitResolveRequest(){const form=document.querySelector('#resolve-request-form');if(!form?.reportValidity())return;const d=new FormData(form);try{await apiFetch(`/requests/${form.dataset.requestId}/resolve`,{method:'POST',body:JSON.stringify({receiving_event_id:d.get('receiving_event_id'),units_received:Number(d.get('units_received'))})});closeModal();await loadHospitalData();toast('Request resolved','All active alerts for this request were revoked.');}catch(error){toast('Request not resolved',error.message,'warning');}}

async function decideHospital(id,decision){const note=window.prompt(`${decision} note (do not enter patient data):`,'Facility credentials reviewed') ?? '';if(decision!=='VERIFIED'&&!note)return;try{await apiFetch(`/hospitals/${id}/verification`,{method:'POST',body:JSON.stringify({decision,note})});await loadAdminData();toast(`Hospital ${decision.toLowerCase()}`,'The account must refresh its Firebase token.');}catch(error){toast('Decision failed',error.message,'warning');}}
async function decideProposal(id,decision){const note=window.prompt('Decision note:','Venue readiness reviewed') ?? '';try{await apiFetch(`/drives/proposals/${id}/decision`,{method:'POST',body:JSON.stringify({decision,note})});await loadProposals();toast('Proposal updated',decision==='APPROVED'?'A scheduled drive was created.':'The organizer can see the new state.');}catch(error){toast('Proposal not updated',error.message,'warning');}}
async function updateDriveStatus(statusValue){try{await apiFetch(`/drives/${state.activeDriveId}/status`,{method:'PATCH',body:JSON.stringify({status:statusValue})});await loadMyDrives();toast('Drive status updated',statusValue);}catch(error){toast('Status not updated',error.message,'warning');}}
async function updateAdminDriveStatus(driveId,statusValue){try{await apiFetch(`/drives/${driveId}/status`,{method:'PATCH',body:JSON.stringify({status:statusValue})});await loadAdminData();toast('Drive review recorded',statusValue);}catch(error){toast('Drive decision failed',error.message,'warning');}}
async function respondToAlert(id,response){try{await apiFetch(`/donors/me/alerts/${id}/response`,{method:'POST',body:JSON.stringify({response})});await loadDonorOperations();toast('Response recorded',response==='ACCEPTED'?'The clinical desk can coordinate next steps.':'The next eligible donor can be contacted.');}catch(error){toast('Response not recorded',error.message,'warning');}}
async function activatePph(){const form=document.querySelector('#pph-form');if(!form?.reportValidity())return;const d=new FormData(form);try{await apiFetch('/logistics/pph',{method:'POST',body:JSON.stringify({request_id:d.get('request_id'),ward:d.get('ward'),clinical_owner_registration:d.get('clinical_owner_registration'),authorization_confirmed:d.has('authorization_confirmed')})});state.emergencyActive=true;state.view='maternity';closeModal();render();toast('PPH bridge activated','Audited logistics notifications were queued.');}catch(error){toast('PPH bridge not activated',error.message,'warning');}}
async function sendRarePager(){const form=document.querySelector('#rare-pager-form');if(!form?.reportValidity())return;const d=new FormData(form);try{const result=await apiFetch('/logistics/rare/dispatch',{method:'POST',body:JSON.stringify({request_id:d.get('request_id'),initial_radius_km:15,cohort_size:Number(d.get('cohort_size'))})});closeModal();toast('Micro-tier pager sent',`${result.donors_contacted} eligible donors have a 10-minute response window.`);}catch(error){toast('Pager not sent',error.message,'warning');}}

app.addEventListener('change', async (event) => {
  const picker = event.target.closest('select[data-action="change-language"]');
  if (picker) {
    state.locale = picker.value;
    setLocale(state.locale);
    render();
    toast('Language updated', languages.find(([code]) => code === state.locale)?.[1] || state.locale);
    return;
  }
  const drivePicker=event.target.closest('select[data-action="select-drive"]');
  if (drivePicker) { state.activeDriveId=drivePicker.value; await loadDriveAnalytics(); }
});

app.addEventListener('click', async (event) => {
  const target = event.target.closest('button, [data-view], [data-role], [data-filter], [data-check]');
  if (!target) return;
  const { action, view, role, filter, check } = target.dataset;
  if (view) { state.view = view; state.roleMenu = false; render(); return; }
  if (role) {
    if (!state.demoMode && !state.allowedRoles.includes(roleConfig[role].claim)) { toast('Access denied','Your email has not been granted this workspace.','warning'); return; }
    state.role = role; state.view = roleConfig[role].landing; state.roleMenu = false; storage.setItem('raktflow-role', role); render();
    if (role === 'admin') loadAdminData();
    if (role === 'organizer') { loadMyDrives(); loadProposals(false); }
    if (role === 'hospital') loadHospitalData();
    if (role === 'venue') loadProposals();
    return;
  }
  if (filter) { state.mapFilter = filter; render(); return; }
  if (check) { state.checkItems[check] = !state.checkItems[check]; render(); return; }
  if (!action) return;
  if (action === 'open-auth') { authModal('signin'); return; }
  if (action === 'join-donor') { authModal('donor'); return; }
  if (action === 'explore-demo') { enterDemo(); return; }
  if (action === 'logout') { await signOutUser(); state.authenticated=false; state.authUser=null; state.account=null; state.screen='landing'; state.demoMode=false; render(); return; }
  if (action === 'profile') { if (state.demoMode) { toast('Demo profile','Sign in to create an encrypted donor record.'); } else { donorProfileModal(); } return; }
  if (action === 'hospital-application') { hospitalApplicationModal(); return; }
  if (action === 'inventory-event') { inventoryEventModal(); return; }
  if (action === 'refresh-hospital') { await loadHospitalData(); return; }
  if (action === 'hospital-decision') { await decideHospital(target.dataset.hospitalId,target.dataset.decision); return; }
  if (action === 'verify-request') { await verifyBloodRequest(target.dataset.requestId); return; }
  if (action === 'resolve-request') { resolveRequestModal(target.dataset.requestId); return; }
  if (action === 'respond-alert') { await respondToAlert(target.dataset.alertId,target.dataset.response); return; }
  if (action === 'invite-user') { inviteUserModal(); return; }
  if (action === 'edit-roles') { editRolesModal(target.dataset.userId); return; }
  if (action === 'refresh-admin') { await loadAdminData(); return; }
  if (action === 'create-drive') { createDriveModal(); return; }
  if (action === 'configure-drive' || action === 'edit-drive') { editDriveModal(); return; }
  if (action === 'create-proposal') { createProposalModal(); return; }
  if (action === 'proposal-decision') { await decideProposal(target.dataset.proposalId,target.dataset.decision); return; }
  if (action === 'refresh-proposals') { await loadProposals(); return; }
  if (action === 'drive-status') { await updateDriveStatus(target.dataset.status); return; }
  if (action === 'admin-drive-status') { await updateAdminDriveStatus(target.dataset.driveId,target.dataset.status); return; }
  if (action === 'refresh-drive') { await loadDriveAnalytics(); return; }
  if (action === 'refresh-public') { await loadPublicData(); return; }
  if (action === 'locate-me') { navigator.geolocation?.getCurrentPosition(()=>toast('Location ready','OpenStreetMap links can use your browser location.'),error=>toast('Location unavailable',error.message,'warning')); return; }
  if (action === 'start-camera') { await startQrCamera(); return; }
  if (action === 'manual-checkin') { await submitManualCheckin(); return; }
  if (action === 'paste-token') { pasteTokenModal(); return; }
  if (action === 'assess-donor') { clinicalAssessmentModal(); return; }
  if (action === 'record-donation') { donationRecordModal(); return; }
  if (action === 'notifications') { notificationsModal(); return; }
  const simpleMessages = {
    'book-slot':['Slot reserved','HarborTech Drive · 18 August · 10:30. A confirmation was added to your pass.'],
    'confirm-window':['Availability confirmed','Group B platelet standby has been updated. You will only be paged if needed.'],
    'decline-alert':['Availability updated','The next eligible donor in the micro-tier will be contacted.'],
    'generate-certificates':['Certificate batch queued','33 co-branded PDFs will be generated and delivered by email and PWA inbox.'],
    'refresh-data':['Data synchronized','Inventory and regional shortage data are current.'],
    'review-request':['Review opened','Document checks are pre-filled; final authorization remains human.'],
    'dispatch-details':['Dispatch opened','Live courier and clinical acknowledgment events are visible.'],
    'download-assets':['Asset pack prepared','Poster, digital flyer, and QR assets are ready for download.'],
    'esg-report':['ESG report generated','The export contains only aggregated, privacy-preserving measures.'],
    'save-logistics':['Readiness saved','The organizer was notified of updated facility checks.'],
    'notifications':['3 operational updates','One rare match, one certificate, and one standby reminder.'],
    'donor-details':['Operational record','This view excludes restricted health responses.'],
    'download-assets':['Asset pack ready','Accessible posters and QR registration files were prepared.']
  };
  if (simpleMessages[action]) { toast(...simpleMessages[action]); return; }
  if (action === 'toggle-role-menu' || action === 'open-role-menu') { state.roleMenu = !state.roleMenu; render(); return; }
  if (action === 'toggle-theme') { state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = state.theme; storage.setItem('raktflow-theme', state.theme); render(); return; }
  if (action === 'toggle-standby') { state.standby = !state.standby; render(); toast('Standby preference saved', state.standby ? 'Targeted apheresis windows are enabled.' : 'Apheresis pager is paused.'); return; }
  if (action === 'open-pass') { closeModal(); openQrPass(); return; }
  if (action === 'screening') { if(state.authenticated&&!state.donorProfile){toast('Profile required','Complete name, date of birth, phone, city, and blood group first.','warning');donorProfileModal();return;} screeningModal(); return; }
  if (action === 'respond-emergency') { toast('Response secured', 'The clinical desk can see your ETA choice. No patient details were disclosed.'); return; }
  if (action === 'new-request') { requestModal(); return; }
  if (action === 'pph-confirm') { pphModal(); return; }
  if (action === 'rare-pager') { rarePagerModal(); return; }
  if (action === 'review-proposal') { proposalModal(); return; }
  if (action === 'copy-link') { copyCampaignLink(); return; }
  if (action === 'simulate-offline') { state.online = !state.online; render(); toast(state.online ? 'Back online' : 'Offline simulation active', state.online ? 'Queued writes will replay as one idempotent batch.' : 'Check-ins are now stored in raktflow_offline_scans.'); return; }
});

modalRoot.addEventListener('click', async (event) => {
  if (event.target.classList.contains('modal-backdrop')) { closeModal(); return; }
  const target = event.target.closest('button, [data-answer]');
  if (!target) return;
  const { action, answer } = target.dataset;
  if (answer !== undefined) { state.wizardAnswers[state.wizardStep] = Number(answer); screeningModal(); return; }
  if (action === 'close-modal') { closeModal(); return; }
  if (action === 'explore-from-modal') { enterDemo(); return; }
  if (action === 'send-magic-link') { await submitMagicLink(); return; }
  if (action === 'google-signin') { try { await signInWithGoogle(); closeModal(); } catch(error) { toast('Google sign-in failed',error.message,'warning'); } return; }
  if (action === 'enable-notifications') { await enableNotifications(); return; }
  if (action === 'save-profile') { await saveDonorProfile(); return; }
  if (action === 'submit-screening') { await submitScreeningForm(); return; }
  if (action === 'send-invitation') { await sendInvitationForm(); return; }
  if (action === 'save-roles') { await saveRolesForm(); return; }
  if (action === 'save-drive') { await saveDriveForm(); return; }
  if (action === 'save-drive-edit') { await saveDriveEdit(); return; }
  if (action === 'submit-proposal') { await submitProposal(); return; }
  if (action === 'submit-hospital-application') { await submitHospitalApplication(); return; }
  if (action === 'submit-inventory-event') { await submitInventoryEvent(); return; }
  if (action === 'submit-resolve-request') { await submitResolveRequest(); return; }
  if (action === 'fill-location') { navigator.geolocation?.getCurrentPosition(position=>{const form=document.querySelector('#hospital-application-form');form.elements.latitude.value=position.coords.latitude.toFixed(6);form.elements.longitude.value=position.coords.longitude.toFixed(6);toast('Coordinates added','Review the facility location before submitting.');},error=>toast('Location unavailable',error.message,'warning')); return; }
  if (action === 'submit-pasted-token') { const token=document.querySelector('#pasted-token')?.value.trim(); if(token) await processScannedToken(token); return; }
  if (action === 'submit-assessment') { await submitAssessment(); return; }
  if (action === 'submit-donation') { await submitDonation(); return; }
  if (action === 'wizard-back') { state.wizardStep = Math.max(1, state.wizardStep-1); screeningModal(); return; }
  if (action === 'wizard-next') { if (state.wizardAnswers[state.wizardStep] === undefined) return; state.wizardStep += 1; screeningModal(); return; }
  if (action === 'screening') { closeModal(); state.wizardStep=1; state.wizardAnswers={}; screeningModal(); return; }
  if (action === 'open-pass') { closeModal(); openQrPass(); return; }
  if (action === 'submit-request') { await submitBloodRequest(); return; }
  if (action === 'activate-pph') { await activatePph(); return; }
  if (action === 'send-rare-alert') { await sendRarePager(); return; }
  if (['approve-proposal','request-changes','decline-proposal'].includes(action)) { closeModal(); toast(action==='approve-proposal'?'Venue approved':'Proposal updated', action==='approve-proposal'?'The organizer can now begin registration.':'The organizer was notified securely.'); }
});

app.addEventListener('pointerenter', (event) => { if (event.target.closest('[data-warm]')) warmApi(); }, true);
window.addEventListener('online', () => { state.online=true; render(); toast('Connection restored','Pending offline writes can now synchronize.'); });
window.addEventListener('offline', () => { state.online=false; render(); toast('Offline mode active','Check-ins will be queued safely on this device.','warning'); });
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeModal();
    if (state.roleMenu) { state.roleMenu = false; render(); }
    return;
  }
  if (event.key === 'Tab' && modalRoot.firstElementChild) {
    const focusable = [...modalRoot.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

if (import.meta.env.PROD) registerServiceWorker(() => toast('Update available', 'RaktFlow will refresh safely after current work is saved.'));
setInterval(async () => {
  if (document.visibilityState !== 'visible' || !isApiConfigured()) return;
  const tasks=[loadPublicData(false)];
  if (state.authenticated && state.allowedRoles.includes('ROLE_DONOR')) tasks.push(loadDonorOperations(false));
  await Promise.allSettled(tasks);
  if (state.screen==='app' && state.role==='donor') render();
}, 30000);
render();

(async function initializeApplication(){
  if (isApiConfigured()) {
    publicApiFetch('/public/stats').then(stats=>{state.publicStats=stats;if(state.screen==='landing')render();}).catch(()=>{});
    loadPublicData(false);
  }
  if (!isAuthConfigured()) return;
  if (location.href.includes('mode=signIn') || location.href.includes('oobCode=')) {
    try { await completeMagicLink(); }
    catch(error) { authModal('signin'); toast('Confirm your email',error.message,'warning'); }
  }
  let bootstrappedUid = null;
  observeAuth(async user=>{
    if(user && bootstrappedUid!==user.uid){bootstrappedUid=user.uid;await bootstrapSession(user);}
    else if(!user && !state.demoMode){state.authenticated=false;state.screen='landing';render();}
  });
})();
