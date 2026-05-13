// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TabsController } from './controller.js';
import type { TabsSnapshot } from './types.js';
import type { SessionController, SessionSnapshot } from '@/desktop/runtime/session-controller.js';

interface TabsContextValue {
  controller: TabsController;
  snapshot: TabsSnapshot;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function TabsProvider({ children }: { children: ReactNode }) {
  const controller = useMemo(() => new TabsController(), []);
  const [snapshot, setSnapshot] = useState<TabsSnapshot>(() => controller.snapshot());

  useEffect(() => controller.subscribe(() => setSnapshot(controller.snapshot())), [controller]);

  const value = useMemo<TabsContextValue>(() => ({ controller, snapshot }), [controller, snapshot]);

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error('useTabs must be used within TabsProvider');
  }
  return ctx;
}

export function useSessionController(): { controller: SessionController; snapshot: SessionSnapshot } {
  const { controller, snapshot } = useTabs();
  return {
    controller: controller.activeController(),
    snapshot: snapshot.activeSnapshot,
  };
}
