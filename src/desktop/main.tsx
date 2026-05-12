import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AppShell } from './AppShell.js';
import { SessionControllerProvider } from './runtime/session-controller-context.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <SessionControllerProvider>
        <AppShell />
      </SessionControllerProvider>
    </HashRouter>
  </React.StrictMode>,
);
