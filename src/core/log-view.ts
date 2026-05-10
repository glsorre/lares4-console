import type { LogEntry, LogTag } from './types.js';

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
  foldGroupId?: string;
  foldedCollapsed?: boolean;
  selectable?: boolean;
  sourceEntryId?: string;
}

export interface MessageListItem {
  id: string;
  tag: LogTag;
  ts: string;
  preview: string;
  collapsed: boolean;
  content: string;
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

export function buildRenderRows(
  entries: LogEntry[],
  gapMs: number = 3000,
  expandedFoldGroups?: ReadonlySet<string>,
): RenderRow[] {
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
        selectable: false,
      });
    }
    if (entry.folded) {
      const expanded = expandedFoldGroups?.has(blockKey) ?? false;
      if (!expanded) {
        rows.push({
          kind: 'entry',
          id: `${blockKey}:${String(idx)}:folded`,
          text: `${entry.folded.preview} … [collapsed]`,
          foldGroupId: blockKey,
          foldedCollapsed: true,
          selectable: true,
          sourceEntryId: blockKey,
        });
      } else {
        const lines = entry.folded.full.split('\n');
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
          const line = lines[lineIdx] ?? '';
          rows.push({
            kind: 'entry',
            id: `${blockKey}:${String(idx)}:expanded:${String(lineIdx)}`,
            text: line.length > 0 ? line : ' ',
            foldGroupId: blockKey,
            foldedCollapsed: false,
            selectable: lineIdx === 0,
            sourceEntryId: blockKey,
          });
        }
      }
    } else {
      rows.push({
        kind: 'entry',
        id: `${blockKey}:${String(idx)}`,
        text: entry.message,
        selectable: true,
        sourceEntryId: blockKey,
      });
    }

    if (prevBlockKey !== blockKey) {
      prevBlockKey = blockKey;
    }
    prevBlockLastTs = parsedTs;
  }
  return rows;
}

export function buildMessageListItems(
  entries: LogEntry[],
  expandedMessageIds?: ReadonlySet<string>,
): MessageListItem[] {
  const items: MessageListItem[] = [];
  const grouped = new Map<string, LogEntry[]>();
  for (let idx = 0; idx < entries.length; idx += 1) {
    const entry = entries[idx];
    if (!entry) continue;
    const key = entry.groupId ?? `entry-${String(idx)}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(entry);
    else grouped.set(key, [entry]);
  }
  for (const [id, groupEntries] of grouped.entries()) {
    const first = groupEntries[0];
    if (!first) continue;
    const folded = first.folded;
    const expanded = expandedMessageIds?.has(id) ?? false;
    const content = folded
      ? (expanded ? folded.full : folded.preview)
      : groupEntries.map((e) => (e.message.length > 0 ? e.message : ' ')).join('\n');
    const firstLine = content.split('\n')[0] ?? '';
    const previewBase = firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;
    items.push({
      id,
      tag: first.tag,
      ts: first.ts,
      preview: folded && !expanded ? `${previewBase} [collapsed]` : previewBase,
      collapsed: Boolean(folded && !expanded),
      content,
    });
  }
  return items;
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
