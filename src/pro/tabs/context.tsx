// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TabsController } from './controller.js';
import type { TabMeta } from './types.js';
import type { SessionController } from '@/desktop/runtime/session-controller.js';
import { INITIAL_SESSION_SNAPSHOT, setSessionSnapshot } from '@/desktop/runtime/session-store.js';

interface TabsListState {
  tabs: TabMeta[];
  activeId: string;
  canAddTab: boolean;
}

interface TabsContextValue {
  controller: TabsController;
  tabs: TabMeta[];
  activeId: string;
  canAddTab: boolean;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function sameTabList(a: TabsListState, b: TabsListState): boolean {
  if (a.activeId !== b.activeId) return false;
  if (a.canAddTab !== b.canAddTab) return false;
  if (a.tabs.length !== b.tabs.length) return false;
  for (let i = 0; i < a.tabs.length; i += 1) {
    const x = a.tabs[i];
    const y = b.tabs[i];
    if (x.id !== y.id || x.label !== y.label || x.status !== y.status
        || x.activeProfileName !== y.activeProfileName) {
      return false;
    }
  }
  return true;
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const controller = useMemo(() => new TabsController(), []);
  const [list, setList] = useState<TabsListState>(() => {
    const s = controller.snapshot();
    setSessionSnapshot(s.activeSnapshot);
    return { tabs: s.tabs, activeId: s.activeId, canAddTab: s.canAddTab };
  });

  useEffect(() => {
    const unsub = controller.subscribe(() => {
      const s = controller.snapshot();
      setSessionSnapshot(s.activeSnapshot);
      setList((prev) => {
        const next: TabsListState = { tabs: s.tabs, activeId: s.activeId, canAddTab: s.canAddTab };
        return sameTabList(prev, next) ? prev : next;
      });
    });
    return () => {
      unsub();
      setSessionSnapshot(INITIAL_SESSION_SNAPSHOT);
    };
  }, [controller]);

  const value = useMemo<TabsContextValue>(
    () => ({ controller, tabs: list.tabs, activeId: list.activeId, canAddTab: list.canAddTab }),
    [controller, list.tabs, list.activeId, list.canAddTab],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error('useTabs must be used within TabsProvider');
  }
  return ctx;
}

export function useSessionController(): { controller: SessionController } {
  const { controller } = useTabs();
  return { controller: controller.activeController() };
}
