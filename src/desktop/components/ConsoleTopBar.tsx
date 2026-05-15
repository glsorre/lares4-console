import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useConnectionStatus, useLogEntries } from '../runtime/session-store.js';
import { ConsoleTopBarLeft } from './ConsoleTopBarLeft.js';
import { ConsoleSearchBar } from './ConsoleSearchBar.js';
import { ConsoleTopBarActions } from './ConsoleTopBarActions.js';

interface ConsoleTopBarProps {
  msgCount: number;
  sidebarOpen: boolean;
  topologyRailOpen: boolean;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  searchPulseKey?: number;
  onToggleSidebar: () => void;
  onToggleTopologyRail: () => void;
  onClearLogs: () => void;
  onExportLogs: () => void;
}

export function ConsoleTopBar({
  msgCount,
  sidebarOpen,
  topologyRailOpen,
  searchInput,
  onSearchInputChange,
  searchPulseKey,
  onToggleSidebar,
  onToggleTopologyRail,
  onClearLogs,
  onExportLogs,
}: ConsoleTopBarProps) {
  const { connected } = useConnectionStatus();
  const logEntries = useLogEntries();
  const [pulse, setPulse] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchPulseKey === undefined) return;
    setPulse(true);
    const handle = window.setTimeout(() => setPulse(false), 900);
    return () => window.clearTimeout(handle);
  }, [searchPulseKey]);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        const node = searchInputRef.current;
        if (!node) return;
        event.preventDefault();
        node.focus();
        node.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className={cn(
        'relative flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-1.5',
        'border-border/70 bg-pane/40 ring-1 ring-border/35',
        'bg-gradient-to-r from-pane/55 via-pane/30 to-pane/55',
        'after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-[oklch(var(--accent)/0.35)] after:to-transparent',
      )}
      aria-live="polite"
    >
      <ConsoleTopBarLeft
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
      />

      {connected && (
        <ConsoleSearchBar
          value={searchInput}
          onChange={onSearchInputChange}
          entries={logEntries}
          inputRef={searchInputRef}
          pulse={pulse}
        />
      )}

      <ConsoleTopBarActions
        msgCount={msgCount}
        topologyRailOpen={topologyRailOpen}
        onClearLogs={onClearLogs}
        onExportLogs={onExportLogs}
        onToggleTopologyRail={onToggleTopologyRail}
      />
    </div>
  );
}
