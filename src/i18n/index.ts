import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './resources/en.json' with { type: 'json' };
import it from './resources/it.json' with { type: 'json' };
import { detectInitialLocale } from './detect-locale.js';
import { setStoredLanguage } from './language-prefs.js';
import type { Locale } from './types.js';

const RESOURCES = {
  en: { translation: en },
  it: { translation: it },
} as const;

let initPromise: Promise<typeof i18n> | null = null;

export function initI18n(): Promise<typeof i18n> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const lng = await detectInitialLocale();
    if (!i18n.isInitialized) {
      await i18n.use(initReactI18next).init({
        resources: RESOURCES,
        lng,
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        returnNull: false,
      });
    } else {
      await i18n.changeLanguage(lng);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lng;
    }
    return i18n;
  })();
  return initPromise;
}

export function initI18nSync(lng: Locale = 'en'): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources: RESOURCES,
      lng,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
      initImmediate: false,
    });
  }
  return i18n;
}

export async function changeLanguage(lng: Locale): Promise<void> {
  setStoredLanguage(lng);
  await i18n.changeLanguage(lng);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
}

export { i18n };
