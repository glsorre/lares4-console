import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AppShell } from './AppShell.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { TabsProvider } from '@pro/tabs/context.js';
import { WindowsProvider } from '@pro/windows/context.js';
import { SessionsProvider } from '@pro/sessions/index.js';
import { bootstrapLicenses } from './runtime/commercial-license-prefs.js';
import { i18n, initI18nSync } from '../i18n/index.js';
import { detectInitialLocale } from '../i18n/detect-locale.js';
import { getStoredLanguage } from '../i18n/language-prefs.js';
import './styles.css';

function render(): void {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <HashRouter>
          <WindowsProvider>
            <TabsProvider>
              <SessionsProvider>
                <AppShell />
              </SessionsProvider>
            </TabsProvider>
          </WindowsProvider>
        </HashRouter>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

// First paint must not depend on Tauri IPC: on a fresh DMG install the
// keychain ACL prompt can stall the WKWebView paint cycle long enough that
// the user sees a blank window. Initialise i18next synchronously with the
// English fallback, render immediately, then finish locale detection and
// license bootstrap in the background. Feature gates self-heal via
// `notifyLicenseChange` and `lazyEnsureVerified` once bootstrap completes.
const initialLocale = getStoredLanguage() ?? 'en';
initI18nSync(initialLocale);
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLocale;
}
render();

void detectInitialLocale()
  .then(async (lng) => {
    if (lng === initialLocale) return;
    await i18n.changeLanguage(lng);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lng;
    }
  })
  .catch((err) => {
    console.warn('[i18n] locale detect rejected:', err);
  });

void bootstrapLicenses().catch((err) => {
  console.warn('[license] bootstrap rejected:', err);
});
