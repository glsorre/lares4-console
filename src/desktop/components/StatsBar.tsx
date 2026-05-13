import { Fragment, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock, Gauge, Hash, Hourglass } from 'lucide-react';
import { computeLogStats } from '../../core/log-stats.js';
import type { LogEntry } from '../../core/types.js';
import { cn } from '@/lib/utils';

interface StatsClusterProps {
  entries: LogEntry[];
  pendingTxCount: number;
  includeTopIds?: boolean;
  className?: string;
}

const pillBase =
  'inline-flex items-center gap-1.5 rounded-md bg-background/60 ring-1 ring-border/40 px-2 py-0.5 text-xs';

export function StatsCluster({ entries, pendingTxCount, includeTopIds = false, className }: StatsClusterProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    void tick;
    return computeLogStats(entries, { windowMs: 5000 });
  }, [entries, tick]);

  const latencyStats = useMemo(() => {
    const samples: number[] = [];
    for (const entry of entries) {
      if (entry.tag === 'ACK' && typeof entry.latencyMs === 'number') samples.push(entry.latencyMs);
    }
    if (samples.length === 0) return undefined;
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    const max = samples[samples.length - 1];
    return { count: samples.length, median, max };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <Fragment>
      <div className={cn(pillBase, 'text-muted-foreground', className)}>
        <Gauge className="size-3.5" aria-hidden />
        <span className="text-foreground font-mono tabular-nums">{stats.eventsPerSecond.toFixed(1)}</span>
        <span>evt/s</span>
      </div>
      <div className={cn(pillBase, 'text-muted-foreground')}>
        <Activity className="size-3.5" aria-hidden />
        <span className="text-foreground font-mono tabular-nums">{stats.totalEvents}</span>
        <span>total</span>
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
          <span>err</span>
        </div>
      )}
      {latencyStats && (
        <div className={cn(pillBase, 'text-muted-foreground')} title={`${latencyStats.count} ACKs sampled`}>
          <Clock className="size-3.5" aria-hidden />
          <span className="text-foreground font-mono tabular-nums">{latencyStats.median}</span>
          <span>ms p50</span>
          <span aria-hidden>·</span>
          <span className="text-foreground font-mono tabular-nums">{latencyStats.max}</span>
          <span>ms max</span>
        </div>
      )}
      {pendingTxCount > 0 && (
        <div
          className={cn(
            pillBase,
            'bg-amber-500/10 ring-amber-500/30 text-amber-700 dark:text-amber-300',
          )}
          title="TX commands awaiting ACK"
        >
          <Hourglass className="size-3.5" aria-hidden />
          <span className="font-mono tabular-nums">{pendingTxCount}</span>
          <span>pending</span>
        </div>
      )}
      {includeTopIds && stats.topIds.length > 0 && (
        <div className={cn(pillBase, 'text-muted-foreground min-w-0')}>
          <Hash className="size-3.5 shrink-0" aria-hidden />
          <span className="shrink-0">top ids</span>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {stats.topIds.map(({ id, count }) => (
              <span
                key={id}
                className="bg-muted/60 border-border/40 rounded border px-1.5 py-0.5 font-mono text-[0.65rem] tabular-nums"
                title={`Events referencing ID=${id}`}
              >
                <span className="text-foreground">{id}</span>
                <span className="text-muted-foreground">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Fragment>
  );
}

export { StatsCluster as StatsBar };
