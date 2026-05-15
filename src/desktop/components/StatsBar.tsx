import { Fragment, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Gauge, Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { computeLogStats } from '../../core/log-stats.js';
import type { LogEntry } from '../../core/types.js';
import { cn } from '@/lib/utils';

interface StatsClusterProps {
  entries: LogEntry[];
  pendingTxCount: number;
  className?: string;
}

const pillBase =
  'inline-flex items-center gap-1.5 rounded-md bg-background/60 ring-1 ring-border/40 px-2 py-0.5 text-xs';

export function StatsCluster({ entries, pendingTxCount, className }: StatsClusterProps) {
  const { t } = useTranslation();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    void tick;
    return computeLogStats(entries, { windowMs: 5000 });
  }, [entries, tick]);

  if (entries.length === 0) return null;

  return (
    <Fragment>
      <div className={cn(pillBase, 'text-muted-foreground', className)}>
        <Gauge className="size-3.5" aria-hidden />
        <span className="text-foreground font-mono tabular-nums">{stats.eventsPerSecond.toFixed(1)}</span>
        <span>{t('stats.evtPerSec')}</span>
      </div>
      <div className={cn(pillBase, 'text-muted-foreground')}>
        <Activity className="size-3.5" aria-hidden />
        <span className="text-foreground font-mono tabular-nums">{stats.totalEvents}</span>
        <span>{t('stats.total')}</span>
      </div>
      {stats.totalErrors > 0 && (
        <div
          className={cn(
            pillBase,
            'bg-red-500/10 ring-red-500/30 text-red-700 dark:text-red-300',
          )}
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          <span className="font-mono tabular-nums">{stats.totalErrors}</span>
          <span>{t('stats.err')}</span>
        </div>
      )}
      {pendingTxCount > 0 && (
        <div
          className={cn(
            pillBase,
            'bg-amber-500/10 ring-amber-500/30 text-amber-700 dark:text-amber-300',
          )}
          title={t('stats.pendingTitle')}
        >
          <Hourglass className="size-3.5" aria-hidden />
          <span className="font-mono tabular-nums">{pendingTxCount}</span>
          <span>{t('stats.pending')}</span>
        </div>
      )}
    </Fragment>
  );
}

export { StatsCluster as StatsBar };
