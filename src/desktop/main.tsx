import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AppShell } from './AppShell.js';
import { TabsProvider } from '@pro/tabs/context.js';
import { WindowsProvider } from '@pro/windows/context.js';
import { bootstrapLicenses } from './runtime/commercial-license-prefs.js';
import './styles.css';

function render(): void {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <HashRouter>
        <WindowsProvider>
          <TabsProvider>
            <AppShell />
          </TabsProvider>
        </WindowsProvider>
      </HashRouter>
    </React.StrictMode>,
  );
}

// Verify any stored license tokens before first render so feature gates are
// in their correct state. Failures (no key, malformed, expired) silently
// resolve — the gates simply stay locked.
void bootstrapLicenses().catch(() => undefined).finally(render);
