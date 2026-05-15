// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { useEffect, useRef, type ReactNode } from 'react';
import { useTabs } from '@pro/tabs/context.js';
import { useLicensed } from '@/desktop/runtime/session-store.js';
import { loadAdapter as defaultLoadAdapter, type SessionsAdapter } from './db.js';
import { SessionPersistenceSink } from './persistence-sink.js';
import { purgeStale } from './retention.js';

interface SessionsProviderProps {
  children: ReactNode;
  /** Test seam: override the adapter loader. */
  loadAdapter?: () => Promise<SessionsAdapter>;
}

export function SessionsProvider({ children, loadAdapter = defaultLoadAdapter }: SessionsProviderProps) {
  const { controller: tabsController, tabs } = useTabs();
  const licensed = useLicensed().sessions;
  const licensedRef = useRef(licensed);
  licensedRef.current = licensed;
  const sinksRef = useRef<Map<string, SessionPersistenceSink>>(new Map());

  useEffect(() => {
    const sinks = sinksRef.current;
    const currentIds = new Set(tabs.map((t) => t.id));
    for (const meta of tabs) {
      if (sinks.has(meta.id)) continue;
      const ctrl = tabsController.controllerForTab(meta.id);
      if (!ctrl) continue;
      const sink = new SessionPersistenceSink({
        loadAdapter,
        getLicensed: () => licensedRef.current,
        getSnapshot: () => ctrl.snapshot(),
        subscribe: (listener) => ctrl.subscribe(listener),
      });
      sinks.set(meta.id, sink);
    }
    for (const [id, sink] of sinks) {
      if (currentIds.has(id)) continue;
      sink.dispose();
      sinks.delete(id);
    }
  }, [tabs, tabsController, loadAdapter]);

  useEffect(() => {
    return () => {
      for (const sink of sinksRef.current.values()) sink.dispose();
      sinksRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!licensed) return;
    let cancelled = false;
    void (async () => {
      try {
        const adapter = await loadAdapter();
        if (cancelled) return;
        await purgeStale(adapter);
      } catch (err) {
        console.warn('[sessions] retention purge failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [licensed, loadAdapter]);

  return <>{children}</>;
}
