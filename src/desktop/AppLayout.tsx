import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Radio, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './components/theme-toggle.js';
import { formatConnectionLabel } from './runtime/connection-label.js';
import {
  connectionChipClasses,
  formatReplayLabel,
  replayChipClasses,
} from './runtime/status-chips.js';
import { useSessionController } from './runtime/session-controller-context.js';

export type LayoutOutletContext = {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
};

export function AppLayout() {
  const { snapshot } = useSessionController();
  const location = useLocation();
  const isConsole = location.pathname === '/console';

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Auto-close sidebar when connected
  useEffect(() => {
    if (snapshot.connectionStatus === 'online') {
      setSidebarOpen(false);
    }
  }, [snapshot.connectionStatus]);

  const connClasses = connectionChipClasses(snapshot.connectionStatus);
  const replayClasses = replayChipClasses(snapshot.replayStatus);
  const replayActive = snapshot.replayStatus && snapshot.replayStatus !== 'off';

  const context: LayoutOutletContext = {
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((v) => !v),
  };

  return (
    <div className="bg-background/80 flex h-dvh min-h-0 flex-col overflow-hidden backdrop-blur-[2px]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:bg-background focus:text-foreground focus:ring-ring focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:outline-none"
      >
        Skip to main content
      </a>

      <header className="border-border/80 from-card/40 to-background/40 flex shrink-0 items-center gap-3 border-b bg-gradient-to-b px-4 py-2.5 shadow-sm">
        {/* Logo */}
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="bg-primary/15 text-primary ring-primary/20 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1">
            <Terminal className="size-3.5" aria-hidden />
          </div>
          <span className="font-heading text-foreground hidden text-sm font-semibold tracking-tight sm:block">
            Lares4 Console
          </span>
        </div>

        {/* Status chips — connection chip toggles sidebar */}
        <div className="flex flex-1 items-center gap-2 overflow-hidden" aria-live="polite">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className={cn(
              'inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80',
              connClasses,
            )}
            aria-label={`Connection: ${formatConnectionLabel(snapshot.connectionStatus)}. Click to toggle panel.`}
            aria-pressed={sidebarOpen}
          >
            <span className="truncate">{formatConnectionLabel(snapshot.connectionStatus)}</span>
          </button>
          {replayActive ? (
            <div
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                replayClasses,
              )}
            >
              <Radio className="size-3 shrink-0 opacity-70" aria-hidden />
              <span className="font-mono truncate">{formatReplayLabel(snapshot.replayStatus)}</span>
            </div>
          ) : null}
        </div>

        {/* Right */}
        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'min-h-0 flex-1',
          isConsole ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5',
        )}
      >
        {isConsole ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Outlet context={context} />
          </div>
        ) : (
          <Outlet context={context} />
        )}
      </main>
    </div>
  );
}
