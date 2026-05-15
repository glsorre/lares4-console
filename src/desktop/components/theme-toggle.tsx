import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'lares4.theme';

export type ThemeMode = 'light' | 'dark' | 'system';

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredTheme(): ThemeMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
    return null;
  } catch {
    return null;
  }
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'system') return getSystemDark();
  return mode === 'dark';
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ThemeMode>(() => {
    const initial = readStoredTheme() ?? 'system';
    const dark = resolveDark(initial);
    document.documentElement.classList.toggle('dark', dark);
    return initial;
  });

  useEffect(() => {
    const dark = resolveDark(mode);
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.classList.toggle('dark', getSystemDark());
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const cycle = () =>
    setMode((m) => {
      if (m === 'light') return 'dark';
      if (m === 'dark') return 'system';
      return 'light';
    });

  const icon =
    mode === 'system' ? (
      <Monitor className="size-4" aria-hidden />
    ) : mode === 'dark' ? (
      <Moon className="size-4" aria-hidden />
    ) : (
      <Sun className="size-4" aria-hidden />
    );

  const label =
    mode === 'system'
      ? t('theme.systemHint')
      : mode === 'dark'
        ? t('theme.darkHint')
        : t('theme.lightHint');

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={cn('shrink-0 border-border/80 bg-background/60 shadow-sm backdrop-blur-sm')}
      onClick={cycle}
      title={label}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}
