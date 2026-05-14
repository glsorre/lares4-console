// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import type { WindowsAdapter } from './controller.js';

const FALLBACK_LABEL = 'main';

function hasTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

function noopAdapter(): WindowsAdapter {
  return {
    currentLabel: () => FALLBACK_LABEL,
    list: async () => [FALLBACK_LABEL],
    open: async () => {
      throw new Error('Multi-window is only available in the desktop build.');
    },
    onWindowOpened: () => () => {},
    onWindowClosed: () => () => {},
  };
}

let cached: WindowsAdapter | undefined;

export function getWindowsAdapter(): WindowsAdapter {
  if (cached) return cached;
  if (!hasTauri()) {
    cached = noopAdapter();
    return cached;
  }
  cached = createTauriAdapter();
  return cached;
}

function createTauriAdapter(): WindowsAdapter {
  let currentLabelCache: string | undefined;

  const currentLabel = (): string => {
    if (currentLabelCache !== undefined) return currentLabelCache;
    try {
      // Dynamic require pattern: read off the global the api uses for its label.
      const internals = (window as unknown as {
        __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } };
      }).__TAURI_INTERNALS__;
      const label = internals?.metadata?.currentWindow?.label;
      if (typeof label === 'string' && label.length > 0) {
        currentLabelCache = label;
        return label;
      }
    } catch { /* ignore */ }
    currentLabelCache = FALLBACK_LABEL;
    return FALLBACK_LABEL;
  };

  const list = async (): Promise<string[]> => {
    try {
      const { getAllWindows } = await import('@tauri-apps/api/window');
      const all = await getAllWindows();
      return all.map((w) => w.label);
    } catch {
      return [currentLabel()];
    }
  };

  const open = async (label: string, route: string): Promise<void> => {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_console_window', { label, route });
  };

  const onWindowOpened = (cb: (label: string) => void): (() => void) => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<string>('tauri://window-created', (event) => {
          const label = typeof event.payload === 'string'
            ? event.payload
            : (event.payload as { label?: string } | null)?.label;
          if (typeof label === 'string') cb(label);
        });
        if (cancelled) fn();
        else unlisten = fn;
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; unlisten?.(); };
  };

  const onWindowClosed = (cb: (label: string) => void): (() => void) => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<string>('tauri://window-destroyed', (event) => {
          const label = typeof event.payload === 'string'
            ? event.payload
            : (event.payload as { label?: string } | null)?.label;
          if (typeof label === 'string') cb(label);
        });
        if (cancelled) fn();
        else unlisten = fn;
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; unlisten?.(); };
  };

  return { currentLabel, list, open, onWindowOpened, onWindowClosed };
}
