import { readFile } from 'node:fs/promises';
import type { LogEntry } from './types.js';
import type { ReplayEvent } from './replay-engine.js';

export type { ReplayEvent } from './replay-engine.js';
export { ReplayEngine } from './replay-engine.js';

function clampMs(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export async function loadReplayFile(path: string): Promise<ReplayEvent[]> {
  const raw = await readFile(path, 'utf8');
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const events: ReplayEvent[] = [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as Partial<ReplayEvent>;
    if (typeof parsed.atMs !== 'number' || !parsed.entry) continue;
    const entry = parsed.entry as Partial<LogEntry>;
    if (
      typeof entry.ts !== 'string'
      || typeof entry.tag !== 'string'
      || typeof entry.level !== 'string'
      || typeof entry.message !== 'string'
    ) {
      continue;
    }
    events.push({
      atMs: clampMs(parsed.atMs),
      entry: {
        ts: entry.ts,
        tag: entry.tag as LogEntry['tag'],
        level: entry.level as LogEntry['level'],
        message: entry.message,
        groupId: typeof entry.groupId === 'string' ? entry.groupId : undefined,
      },
    });
  }
  events.sort((a, b) => a.atMs - b.atMs);
  return events;
}
