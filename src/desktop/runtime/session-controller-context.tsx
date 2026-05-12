import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SessionController, type SessionSnapshot } from './session-controller.js';

const SessionControllerContext = createContext<{
  controller: SessionController;
  snapshot: SessionSnapshot;
} | null>(null);

export function SessionControllerProvider({ children }: { children: ReactNode }) {
  const controller = useMemo(() => new SessionController(), []);
  const [snapshot, setSnapshot] = useState(() => controller.snapshot());

  useEffect(() => controller.subscribe(() => setSnapshot(controller.snapshot())), [controller]);

  const value = useMemo(() => ({ controller, snapshot }), [controller, snapshot]);

  return <SessionControllerContext.Provider value={value}>{children}</SessionControllerContext.Provider>;
}

export function useSessionController() {
  const ctx = useContext(SessionControllerContext);
  if (!ctx) {
    throw new Error('useSessionController must be used within SessionControllerProvider');
  }
  return ctx;
}
