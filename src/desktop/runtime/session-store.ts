// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_EVENT_FILTERS } from '../../core/defaults.js';
import type { SessionSnapshot, ActiveMacroSnapshot } from './session-controller.js';

export const INITIAL_SESSION_SNAPSHOT: SessionSnapshot = {
  connected: false,
  connectionStatus: 'idle',
  outputFormat: 'pretty',
  eventFilters: Array.from(DEFAULT_EVENT_FILTERS),
  logEntries: [],
  commandLine: '',
  error: undefined,
  logTagFilters: undefined,
  activeProfileName: undefined,
  macros: [],
  activeMacro: undefined,
  recordingMacro: false,
  recordingMacroSteps: 0,
  topology: { groups: [], total: 0 },
  topologyDiff: { addedIds: new Set(), removedIds: new Set() },
  bookmarks: [],
  triggers: [],
  pendingTxCount: 0,
  liveStreamPaused: false,
  readOnly: false,
  licensed: { macros: false, tabs: false, triggers: false, annotations: false, multiwindow: false },
};

/** Global store mirroring the active tab's SessionController.snapshot().
 *  TabsProvider is responsible for keeping this in sync via setState. */
export const useSessionStore = create<SessionSnapshot>(() => INITIAL_SESSION_SNAPSHOT);

/** Replace the store with a fresh snapshot. Called by TabsProvider on every controller
 *  emit and on tab switch. Selector hooks below rely on identity equality for slice
 *  references — see SessionController snapshot-stability caches. */
export function setSessionSnapshot(snapshot: SessionSnapshot): void {
  useSessionStore.setState(snapshot, true);
}

export interface ConnectionSlice {
  connected: boolean;
  connectionStatus: SessionSnapshot['connectionStatus'];
  error: string | undefined;
}

export function useConnectionStatus(): ConnectionSlice {
  return useSessionStore(
    useShallow((s): ConnectionSlice => ({
      connected: s.connected,
      connectionStatus: s.connectionStatus,
      error: s.error,
    })),
  );
}

export function useLogEntries(): SessionSnapshot['logEntries'] {
  return useSessionStore((s) => s.logEntries);
}

export function useCommandLine(): string {
  return useSessionStore((s) => s.commandLine);
}

export interface MacrosSlice {
  macros: SessionSnapshot['macros'];
  activeMacro: ActiveMacroSnapshot | undefined;
  recordingMacro: boolean;
  recordingMacroSteps: number;
}

export function useMacrosSlice(): MacrosSlice {
  return useSessionStore(
    useShallow((s): MacrosSlice => ({
      macros: s.macros,
      activeMacro: s.activeMacro,
      recordingMacro: s.recordingMacro,
      recordingMacroSteps: s.recordingMacroSteps,
    })),
  );
}

export function useTriggers(): SessionSnapshot['triggers'] {
  return useSessionStore((s) => s.triggers);
}

export function useBookmarks(): SessionSnapshot['bookmarks'] {
  return useSessionStore((s) => s.bookmarks);
}

export function useTopology(): SessionSnapshot['topology'] {
  return useSessionStore((s) => s.topology);
}

export function useTopologyDiff(): SessionSnapshot['topologyDiff'] {
  return useSessionStore((s) => s.topologyDiff);
}

export function useLicensed(): SessionSnapshot['licensed'] {
  return useSessionStore((s) => s.licensed);
}

export function useReadOnly(): boolean {
  return useSessionStore((s) => s.readOnly);
}

export function useLiveStreamPaused(): boolean {
  return useSessionStore((s) => s.liveStreamPaused);
}

export function useLogTagFilters(): SessionSnapshot['logTagFilters'] {
  return useSessionStore((s) => s.logTagFilters);
}

export function useEventFilters(): SessionSnapshot['eventFilters'] {
  return useSessionStore((s) => s.eventFilters);
}

export function useOutputFormat(): SessionSnapshot['outputFormat'] {
  return useSessionStore((s) => s.outputFormat);
}

export function usePendingTxCount(): number {
  return useSessionStore((s) => s.pendingTxCount);
}

export function useActiveProfileName(): string | undefined {
  return useSessionStore((s) => s.activeProfileName);
}
