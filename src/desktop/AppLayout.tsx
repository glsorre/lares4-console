import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Radio, Terminal } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AboutDialog } from './components/AboutDialog.js';
import { ThemeToggle } from './components/theme-toggle.js';
import { formatConnectionLabel } from './runtime/connection-label.js';
import {
  connectionChipClasses,
  formatReplayLabel,
  replayChipClasses,
  replayPhase,
} from './runtime/status-chips.js';
import { BASE } from './runtime/motion-presets.js';
import { useSessionController } from '@pro/tabs/context.js';
import { TabsStrip } from '@pro/tabs/ui/TabsStrip.js';

export type LayoutOutletContext = {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
};

export function AppLayout() {
  const { snapshot } = useSessionController();
  const location = useLocation();
  const isConsole = location.pathname === '/console';

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Auto-close sidebar when connected
  useEffect(() => {
    if (snapshot.connectionStatus === 'online') {
      setSidebarOpen(false);
    }
  }, [snapshot.connectionStatus]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    void listen('menu://about', () => setAboutOpen(true))
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        /* not running under Tauri (e.g. plain vite) */
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const connClasses = connectionChipClasses(snapshot.connectionStatus);
  const replayClasses = replayChipClasses(snapshot.replayStatus);
  const replayLoaded = replayPhase(snapshot.replayStatus) !== 'off';
  const reduceMotion = useReducedMotion();
  const enter = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, transition: BASE };

  const context: LayoutOutletContext = {
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((v) => !v),
  };

  return (
    <TooltipProvider delayDuration={300}>
    <div className="bg-background/80 flex h-dvh min-h-0 flex-col overflow-hidden backdrop-blur-[2px]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:bg-background focus:text-foreground focus:ring-ring focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:outline-none"
      >
        Skip to main content
      </a>

      <motion.header
        {...enter}
        className="border-border/80 from-card/40 to-background/40 flex shrink-0 items-center gap-3 border-b bg-gradient-to-b px-4 py-2.5 shadow-sm"
      >
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
          {replayLoaded ? (
            <div
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                replayClasses,
              )}
              aria-label={`Replay: ${formatReplayLabel(snapshot.replayStatus)}`}
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
      </motion.header>

      <TabsStrip />

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
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
    </TooltipProvider>
  );
}
