import type { LogEntry, LogTag } from './types.js';

export interface LogStats {
  totalByTag: Record<LogTag, number>;
  totalErrors: number;
  totalEvents: number;
  eventsPerSecond: number;
}

const TAGS: LogTag[] = ['ACK', 'RAW_RX', 'RAW_TX', 'BULK', 'CHANGE', 'ERROR', 'LOG', 'SYSTEM'];

function emptyTagCounter(): Record<LogTag, number> {
  const out = {} as Record<LogTag, number>;
  for (const tag of TAGS) out[tag] = 0;
  return out;
}

export interface ComputeStatsOptions {
  /** Window for events/sec in ms. Default 5000. */
  windowMs?: number;
  /** Reference time for the window. Default Date.now(). */
  nowMs?: number;
}

export function computeLogStats(
  entries: readonly LogEntry[],
  options: ComputeStatsOptions = {},
): LogStats {
  const windowMs = options.windowMs ?? 5000;
  const nowMs = options.nowMs ?? Date.now();
  const totalByTag = emptyTagCounter();
  let totalErrors = 0;
  let recentCount = 0;
  for (const entry of entries) {
    totalByTag[entry.tag] = (totalByTag[entry.tag] ?? 0) + 1;
    if (entry.level === 'error' || entry.tag === 'ERROR') totalErrors += 1;
    const t = Date.parse(entry.ts);
    if (!Number.isNaN(t) && nowMs - t <= windowMs) recentCount += 1;
  }
  const eventsPerSecond = windowMs > 0 ? (recentCount * 1000) / windowMs : 0;
  return {
    totalByTag,
    totalErrors,
    totalEvents: entries.length,
    eventsPerSecond,
  };
}
