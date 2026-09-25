import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enDashboard from './locales/en/dashboard.json';
import enBrowse from './locales/en/browse.json';
import enDocuments from './locales/en/documents.json';
import enShares from './locales/en/shares.json';
import enMembers from './locales/en/members.json';
import enSettings from './locales/en/settings.json';
import enActivity from './locales/en/activity.json';
import enItems from './locales/en/items.json';
import enSearch from './locales/en/search.json';
import enBin from './locales/en/bin.json';
import enScan from './locales/en/scan.json';
import enPlatform from './locales/en/platform.json';
import enResize from './locales/en/resize.json';
import enAdmin from './locales/en/admin.json';
import enAdminOps from './locales/en/adminOps.json';

import hiCommon from './locales/hi/common.json';
import hiAuth from './locales/hi/auth.json';
import hiDashboard from './locales/hi/dashboard.json';
import hiBrowse from './locales/hi/browse.json';
import hiDocuments from './locales/hi/documents.json';
import hiShares from './locales/hi/shares.json';
import hiMembers from './locales/hi/members.json';
import hiSettings from './locales/hi/settings.json';
import hiActivity from './locales/hi/activity.json';
import hiItems from './locales/hi/items.json';
import hiSearch from './locales/hi/search.json';
import hiBin from './locales/hi/bin.json';
import hiScan from './locales/hi/scan.json';
import hiPlatform from './locales/hi/platform.json';
import hiResize from './locales/hi/resize.json';
import hiAdmin from './locales/hi/admin.json';
import hiAdminOps from './locales/hi/adminOps.json';

// Persisted-language localStorage key. Same naming convention as
// ThemeContext's `family-vault-theme` (docs/UI_KIT.md §Contexts) — kept
// deliberately separate from `services/storage.js`'s `STORAGE_KEYS` since
// this key is read by `i18next-browser-languagedetector` itself (before
// react-i18next/AuthContext exist), not by our own storage wrapper.
export const LANGUAGE_STORAGE_KEY = 'family-vault-lang';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];

export const NAMESPACES = [
  'common',
  'auth',
  'dashboard',
  'browse',
  'documents',
  'shares',
  'members',
  'settings',
  'activity',
  'items',
  'search',
  'bin',
  'platform',
  'scan',
  'resize',
  'admin',
  'adminOps',
];

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    browse: enBrowse,
    documents: enDocuments,
    shares: enShares,
    members: enMembers,
    settings: enSettings,
    activity: enActivity,
    items: enItems,
    search: enSearch,
    bin: enBin,
    platform: enPlatform,
    scan: enScan,
    resize: enResize,
    admin: enAdmin,
    adminOps: enAdminOps,
  },
  hi: {
    common: hiCommon,
    auth: hiAuth,
    dashboard: hiDashboard,
    browse: hiBrowse,
    documents: hiDocuments,
    shares: hiShares,
    members: hiMembers,
    settings: hiSettings,
    activity: hiActivity,
    items: hiItems,
    search: hiSearch,
    bin: hiBin,
    platform: hiPlatform,
    scan: hiScan,
    resize: hiResize,
    admin: hiAdmin,
    adminOps: hiAdminOps,
  },
};

// react-i18next's simpler init pattern: call `i18n.use(initReactI18next).init(...)`
// once and import this module for its side effect in main.jsx (before the app
// renders). Every `useTranslation()` call anywhere in the tree then picks up
// this same global instance automatically — no <I18nextProvider> wrapper
// needed (that's only required when running more than one i18next instance).
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi'],
    ns: NAMESPACES,
    defaultNS: 'common',
    fallbackNS: 'common',
    detection: {
      // Order: a previously-persisted choice wins; otherwise fall back to
      // the browser/OS language (per the task's "OS/browser-default
      // detection, though you'll override with the persisted choice once
      // set"). `caches: ['localStorage']` is what makes `changeLanguage()`
      // persist the choice for next visit without any extra code.
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
    interpolation: {
      escapeValue: false, // React already escapes — avoid double-escaping.
    },
    returnEmptyString: false,
  });

// Keep <html lang> in step with the app language, so screen readers read Hindi as Hindi.
function setDocumentLang(lng) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = (lng || 'en').split('-')[0];
}
setDocumentLang(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', setDocumentLang);

export default i18n;
