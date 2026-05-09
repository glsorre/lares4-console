import type { LogEntry, LogTag } from './types.js';

const LOG_PANE_MIN_ROWS = 8;
/** Reserve rows for status line, command box, footer strip, and bordered log layout in `App.tsx`. */
const LOG_PANE_CHROME_RESERVE = 8;

export interface LogPaneRowCountOptions {
  /** Extra rows used below the log (completion strip, expanded help, etc.). Keeps total layout within the terminal. */
  readonly extraChromeRows?: number;
}

/** Height of the log viewport in terminal rows (uses live `stdout.rows` when available). */
export function getLogPaneRowCount(options?: LogPaneRowCountOptions): number {
  const extra = Math.max(0, options?.extraChromeRows ?? 0);
  const r = process.stdout.rows;
  const full = typeof r === 'number' && r > 0 ? r : 30;
  return Math.max(LOG_PANE_MIN_ROWS, full - LOG_PANE_CHROME_RESERVE - extra);
}

/** Largest tail-based scroll offset (`scrollOffset`) for pane height; aligns with cli `clampScrollOffset`. */
export function maxTailScrollOffset(totalRows: number, paneRows: number): number {
  return Math.max(0, totalRows - paneRows);
}

export interface LogViewport {
  start: number;
  end: number;
  visible: LogEntry[];
  maxOffset: number;
}

export interface RenderRow {
  kind: 'entry' | 'separator';
  id?: string;
  text: string;
  strong?: boolean;
}

export function formatLogClock(ts: string): string {
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return '--:--:--';
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function hrBetweenBlocks(strong: boolean, tag: LogTag, ts: string): string {
  const ch = strong ? '━' : '─';
  const label = `[${tag} ${formatLogClock(ts)}]`;
  return `${ch.repeat(3)} ${label} ${ch.repeat(3)}`;
}

export function getLogViewport(entries: LogEntry[], scrollOffset: number, pageSize: number): LogViewport {
  const safePageSize = Math.max(1, pageSize);
  const maxOffset = Math.max(0, entries.length - safePageSize);
  const clampedOffset = Math.max(0, Math.min(scrollOffset, maxOffset));
  const end = Math.max(0, entries.length - clampedOffset);
  const start = Math.max(0, end - safePageSize);
  return {
    start,
    end,
    visible: entries.slice(start, end),
    maxOffset,
  };
}

export function buildRenderRows(entries: LogEntry[], gapMs: number = 3000): RenderRow[] {
  const rows: RenderRow[] = [];
  let prevBlockKey: string | undefined;
  let prevBlockLastTs: number | undefined;

  for (let idx = 0; idx < entries.length; idx += 1) {
    const entry = entries[idx];
    if (!entry) continue;
    const blockKey = entry.groupId ?? `entry-${String(idx)}`;
    const parsedTs = Number.isNaN(Date.parse(entry.ts)) ? undefined : Date.parse(entry.ts);

    if (rows.length > 0 && prevBlockKey !== blockKey) {
      const strong = prevBlockLastTs !== undefined && parsedTs !== undefined && Math.max(0, parsedTs - prevBlockLastTs) >= gapMs;
      rows.push({
        kind: 'separator',
        id: `sep:${blockKey}`,
        text: hrBetweenBlocks(strong, entry.tag, entry.ts),
        strong,
      });
    }
    rows.push({ kind: 'entry', id: `${blockKey}:${String(idx)}`, text: entry.message });

    if (prevBlockKey !== blockKey) {
      prevBlockKey = blockKey;
    }
    prevBlockLastTs = parsedTs;
  }
  return rows;
}

export function totalRenderRowCount(entries: LogEntry[], gapMs: number = 3000): number {
  return buildRenderRows(entries, gapMs).length;
}

export function getVisibleRenderRowsFromFlat(
  flatRows: RenderRow[],
  scrollOffset: number,
  pageHeight: number,
  overscan: number = 0,
): { rows: RenderRow[]; maxOffset: number; totalRows: number; start: number; end: number } {
  const totalRows = flatRows.length;
  const safePage = Math.max(1, pageHeight);
  const maxOffset = Math.max(0, totalRows - safePage);
  const clamped = Math.max(0, Math.min(scrollOffset, maxOffset));
  const end = Math.max(0, Math.min(totalRows, totalRows - clamped + Math.max(0, overscan)));
  const start = Math.max(0, end - safePage - Math.max(0, overscan) * 2);
  return { rows: flatRows.slice(start, end), maxOffset, totalRows, start, end };
}

export function getVisibleRenderRows(
  entries: LogEntry[],
  scrollOffset: number,
  pageHeight: number,
  gapMs: number = 3000,
  overscan: number = 0,
): { rows: RenderRow[]; maxOffset: number; totalRows: number } {
  const flat = buildRenderRows(entries, gapMs);
  const visible = getVisibleRenderRowsFromFlat(flat, scrollOffset, pageHeight, overscan);
  return { rows: visible.rows, maxOffset: visible.maxOffset, totalRows: visible.totalRows };
}
