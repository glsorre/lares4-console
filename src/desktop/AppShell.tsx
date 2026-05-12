import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout.js';
import { ConsolePage } from './pages/ConsolePage.js';
import { IndexRedirect } from './routes/IndexRedirect.js';

export function AppShell() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<IndexRedirect />} />
        <Route path="console" element={<ConsolePage />} />
      </Route>
    </Routes>
  );
}
