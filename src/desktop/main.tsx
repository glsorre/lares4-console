import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AppShell } from './AppShell.js';
import { TabsProvider } from '@pro/tabs/context.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <TabsProvider>
        <AppShell />
      </TabsProvider>
    </HashRouter>
  </React.StrictMode>,
);
