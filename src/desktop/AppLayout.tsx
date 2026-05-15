import { useEffect, useReducer, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Terminal } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AboutDialog } from './components/AboutDialog.js';
import { ThemeToggle } from './components/theme-toggle.js';
import { LanguageToggle } from './components/LanguageToggle.js';
import { ReadOnlyToggle } from './components/ReadOnlyToggle.js';
import { UpdateBanner } from './components/UpdateBanner.js';
import { NewWindowButton } from '@pro/windows/ui/NewWindowButton.js';
import { HistoryNavButton } from '@pro/sessions/HistoryNavButton.js';
import { useIsMainWindow } from '@pro/windows/context.js';
import {
  getUpdaterAdapter,
  nextUpdaterState,
  runCheck,
  type UpdaterState,
} from './runtime/updater.js';
import { connectionLabelKey, formatConnectionLabel } from './runtime/connection-label.js';
import { connectionChipClasses } from './runtime/status-chips.js';
import { BASE } from './runtime/motion-presets.js';
import { useConnectionStatus, useReadOnly } from './runtime/session-store.js';
import { TabsStrip } from '@pro/tabs/ui/TabsStrip.js';

export type LayoutOutletContext = {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
};

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const { connectionStatus } = useConnectionStatus();
  const readOnly = useReadOnly();
  const location = useLocation();
  const navigate = useNavigate();
  const isMainWindow = useIsMainWindow();
  const isConsole = location.pathname === '/console';

  const connectionLabel = (() => {
    const key = connectionLabelKey(connectionStatus);
    return key ? t(key) : formatConnectionLabel(connectionStatus);
  })();

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = i18n.language;
    }
    const onChange = (lng: string) => {
      if (typeof document !== 'undefined') document.documentElement.lang = lng;
      void (async () => {
        try {
          const mod = await import('@tauri-apps/api/window');
          await mod.getCurrentWindow().setTitle(t('app.windowTitle'));
        } catch { /* not in Tauri */ }
      })();
    };
    i18n.on('languageChanged', onChange);
    onChange(i18n.language);
    return () => { i18n.off('languageChanged', onChange); };
  }, [i18n, t]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [updaterState, dispatchUpdater] = useReducer(nextUpdaterState, { phase: 'idle' } as UpdaterState);
  const [updaterDismissed, setUpdaterDismissed] = useState(false);

  useEffect(() => {
    if (!isMainWindow) return;
    let cancelled = false;
    void (async () => {
      const adapter = await getUpdaterAdapter();
      if (cancelled || !adapter) return;
      dispatchUpdater({ type: 'check-start' });
      const outcome = await runCheck(adapter);
      if (cancelled) return;
      dispatchUpdater({ type: 'check-result', outcome });
    })();
    return () => { cancelled = true; };
  }, [isMainWindow]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    void listen<{ label?: string; route?: string }>('window://navigate', (event) => {
      const route = event.payload?.route;
      if (typeof route === 'string' && route.length > 0) navigate(route);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => { /* not in Tauri */ });
    return () => { cancelled = true; unlisten?.(); };
  }, [navigate]);

  const installUpdate = () => {
    void (async () => {
      const adapter = await getUpdaterAdapter();
      if (!adapter) return;
      dispatchUpdater({ type: 'install-start' });
      try {
        await adapter.install((event) => {
          if (event.phase === 'progress') {
            dispatchUpdater({
              type: 'install-progress',
              downloaded: event.downloaded,
              total: event.total,
            });
          } else if (event.phase === 'started') {
            dispatchUpdater({ type: 'install-progress', downloaded: 0, total: event.total });
          }
        });
        dispatchUpdater({ type: 'install-done' });
        await adapter.restart();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        dispatchUpdater({ type: 'check-result', outcome: { kind: 'error', message } });
      }
    })();
  };

  // Auto-close sidebar when connected
  useEffect(() => {
    if (connectionStatus === 'online') {
      setSidebarOpen(false);
    }
  }, [connectionStatus]);

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

  const connClasses = connectionChipClasses(connectionStatus);
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
        {t('app.skipToMain')}
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
            {t('app.brand')}
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
            aria-label={t('app.connectionAria', { label: connectionLabel })}
            aria-pressed={sidebarOpen}
          >
            <span className="truncate">{connectionLabel}</span>
          </button>
          {readOnly ? (
            <div
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-100/70 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              aria-label={t('app.readOnlyAria')}
            >
              <span className="truncate">{t('app.readOnlyLabel')}</span>
            </div>
          ) : null}
        </div>

        {/* Right */}
        <div className="flex shrink-0 items-center gap-1.5">
          <HistoryNavButton />
          <NewWindowButton />
          <ReadOnlyToggle />
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </motion.header>

      <TabsStrip />

      {isMainWindow && !updaterDismissed && (updaterState.phase === 'available' || updaterState.phase === 'installing') ? (
        <UpdateBanner
          state={updaterState}
          onInstall={installUpdate}
          onDismiss={() => setUpdaterDismissed(true)}
        />
      ) : null}

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
