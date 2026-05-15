// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { WindowsController } from './controller.js';
import type { WindowsSnapshot } from './types.js';
import { getWindowsAdapter } from './adapter-tauri.js';

interface WindowsContextValue {
  controller: WindowsController;
  snapshot: WindowsSnapshot;
}

const WindowsContext = createContext<WindowsContextValue | null>(null);

export function WindowsProvider({ children }: { children: ReactNode }) {
  const controller = useMemo(() => new WindowsController({ adapter: getWindowsAdapter() }), []);
  const [snapshot, setSnapshot] = useState<WindowsSnapshot>(() => controller.snapshot());

  useEffect(() => {
    const unsub = controller.subscribe(() => setSnapshot(controller.snapshot()));
    return () => { unsub(); };
  }, [controller]);

  const value = useMemo<WindowsContextValue>(() => ({ controller, snapshot }), [controller, snapshot]);

  return <WindowsContext.Provider value={value}>{children}</WindowsContext.Provider>;
}

export function useWindows(): WindowsContextValue {
  const ctx = useContext(WindowsContext);
  if (!ctx) throw new Error('useWindows must be used within WindowsProvider');
  return ctx;
}

export function useIsMainWindow(): boolean {
  const { snapshot } = useWindows();
  return snapshot.currentLabel === 'main';
}
