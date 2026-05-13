import type { LogEntry, LogTag } from './types.js';

export interface LogStats {
  totalByTag: Record<LogTag, number>;
  totalErrors: number;
  totalEvents: number;
  eventsPerSecond: number;
  topIds: Array<{ id: string; count: number }>;
}

const TAGS: LogTag[] = ['ACK', 'RAW_RX', 'RAW_TX', 'BULK', 'CHANGE', 'ERROR', 'LOG', 'SYSTEM'];

function emptyTagCounter(): Record<LogTag, number> {
  const out = {} as Record<LogTag, number>;
  for (const tag of TAGS) out[tag] = 0;
  return out;
}

function extractIds(payload: unknown, out: Set<string>): void {
  if (payload === null || payload === undefined) return;
  if (Array.isArray(payload)) {
    for (const item of payload) extractIds(item, out);
    return;
  }
  if (typeof payload !== 'object') return;
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (k === 'ID' || k === 'id') {
      if (v !== undefined && v !== null && typeof v !== 'object') out.add(String(v));
    }
    if (v && typeof v === 'object') extractIds(v, out);
  }
}

export interface ComputeStatsOptions {
  /** Window for events/sec in ms. Default 5000. */
  windowMs?: number;
  /** Reference time for the window. Default Date.now(). */
  nowMs?: number;
  /** Limit on topIds. Default 5. */
  topIdsLimit?: number;
}

export function computeLogStats(
  entries: readonly LogEntry[],
  options: ComputeStatsOptions = {},
): LogStats {
  const windowMs = options.windowMs ?? 5000;
  const nowMs = options.nowMs ?? Date.now();
  const topIdsLimit = options.topIdsLimit ?? 5;
  const totalByTag = emptyTagCounter();
  const idCounts = new Map<string, number>();
  let totalErrors = 0;
  let recentCount = 0;
  for (const entry of entries) {
    totalByTag[entry.tag] = (totalByTag[entry.tag] ?? 0) + 1;
    if (entry.level === 'error' || entry.tag === 'ERROR') totalErrors += 1;
    const t = Date.parse(entry.ts);
    if (!Number.isNaN(t) && nowMs - t <= windowMs) recentCount += 1;
    if (entry.payload !== undefined) {
      const ids = new Set<string>();
      extractIds(entry.payload, ids);
      for (const id of ids) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }
  }
  const topIds = [...idCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topIdsLimit)
    .map(([id, count]) => ({ id, count }));
  const eventsPerSecond = windowMs > 0 ? (recentCount * 1000) / windowMs : 0;
  return {
    totalByTag,
    totalErrors,
    totalEvents: entries.length,
    eventsPerSecond,
    topIds,
  };
}
