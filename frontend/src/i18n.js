import en from './locales/en.json';

export const languages = [
  ['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు'], ['bn', 'বাংলা'],
  ['mr', 'मराठी'], ['ta', 'தமிழ்'], ['kn', 'ಕನ್ನಡ'], ['ml', 'മലയാളം']
];

const supported = new Set(languages.map(([code]) => code));
const loaders = {
  hi: () => import('./locales/hi.json'),
  te: () => import('./locales/te.json'),
  bn: () => import('./locales/bn.json'),
  mr: () => import('./locales/mr.json'),
  ta: () => import('./locales/ta.json'),
  kn: () => import('./locales/kn.json'),
  ml: () => import('./locales/ml.json')
};
export const catalogs = { en };

export async function loadLocale(locale) {
  const normalized = supported.has(locale) ? locale : 'en';
  if (!catalogs[normalized] && loaders[normalized]) {
    catalogs[normalized] = (await loaders[normalized]()).default;
  }
  return normalized;
}

export function getLocale() {
  let value = 'en';
  try { value = localStorage.getItem('raktflow-locale') || 'en'; } catch { /* restricted storage */ }
  return supported.has(value) ? value : 'en';
}

export function setLocale(locale) {
  const normalized = supported.has(locale) ? locale : 'en';
  try { localStorage.setItem('raktflow-locale', normalized); } catch { /* restricted storage */ }
  document.documentElement.lang = normalized;
}

export function tr(key, variables = {}, locale = getLocale()) {
  const catalog = catalogs[locale] || catalogs.en;
  const value = catalog[key] || catalogs.en[key] || key;
  return Object.entries(variables).reduce(
    (message, [name, replacement]) => message.replaceAll(`{${name}}`, String(replacement)),
    value
  );
}

export function translationCoverage() {
  const englishKeys = Object.keys(catalogs.en).sort();
  return Object.fromEntries(
    Object.entries(catalogs).map(([locale, catalog]) => [
      locale,
      {
        missing: englishKeys.filter(key => !catalog[key]),
        extra: Object.keys(catalog).filter(key => !catalogs.en[key]).sort(),
        total: Object.keys(catalog).length
      }
    ])
  );
}
