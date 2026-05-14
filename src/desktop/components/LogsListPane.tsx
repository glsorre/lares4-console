import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  Info,
  Layers,
  Pause,
  Pin,
  Star,
  Terminal,
} from 'lucide-react';
import { ProFeatureLock } from './ProFeatureLock';
import { PaneEmpty } from './PaneEmpty.js';
import { useSessionController } from '@pro/tabs/context.js';
import { buildMessageListItems, formatLogClock } from '../../core/log-view.js';
import { compileChipFilters, extractFreeTextTerms } from '../../core/log-query.js';
import type { LogEntry, LogTag } from '../../core/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LogTagChip } from './LogTagChip.js';
import { ackResultChipClasses } from '../runtime/status-chips.js';

const TAIL_THRESHOLD_PX = 24;

type IconComp = ComponentType<SVGProps<SVGSVGElement>>;

function getTagIcon(tag: LogTag): IconComp {
  switch (tag) {
    case 'RAW_RX': return ArrowDownLeft;
    case 'RAW_TX': return ArrowUpRight;
    case 'ACK':    return CornerDownLeft;
    case 'CHANGE': return Activity;
    case 'BULK':   return Layers;
    case 'ERROR':  return AlertTriangle;
    case 'LOG':    return Terminal;
    case 'SYSTEM': return Info;
    default:       return Info;
  }
}

interface LogsListPaneProps {
  entries: LogEntry[];
  selectedId?: string;
  onSelect: (id: string) => void;
  searchInput: string;
  bookmarkedIds: ReadonlySet<string>;
  onToggleBookmark: (id: string) => void;
  pinnedId: string | undefined;
  onPinnedIdChange: (id: string | undefined) => void;
  annotationsLicensed: boolean;
}

const ROW_ENTER_CAP = 30;

export function LogsListPane({
  entries,
  selectedId,
  onSelect,
  searchInput,
  bookmarkedIds,
  onToggleBookmark,
  pinnedId,
  onPinnedIdChange,
  annotationsLicensed,
}: LogsListPaneProps) {
  const { snapshot } = useSessionController();
  const connected = snapshot.connected;
  const [followTail, setFollowTail] = useState<boolean>(true);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const reduceMotion = useReducedMotion();
  const animateFromIndex = (idx: number, total: number) => !reduceMotion && idx >= total - ROW_ENTER_CAP;

  const chipFilters = useMemo(() => compileChipFilters(searchInput), [searchInput]);
  const searchTerms = useMemo(() => extractFreeTextTerms(searchInput), [searchInput]);

  const filteredEntries = useMemo(() => {
    if (chipFilters.isEmpty) return entries;
    return entries.filter((entry) => chipFilters.predicate(entry));
  }, [entries, chipFilters]);

  const items = useMemo(() => buildMessageListItems(filteredEntries), [filteredEntries]);
  const matchByItemId = useMemo(() => {
    if (searchTerms.length === 0) return undefined;
    const map = new Map<string, boolean>();
    for (const it of items) {
      const childText = it.children?.map((c) => c.line).join('\n') ?? '';
      const haystack = `${it.preview}\n${childText}\n${JSON.stringify(it.payload ?? '')}`.toLowerCase();
      map.set(it.id, searchTerms.some((t) => haystack.includes(t)));
    }
    return map;
  }, [items, searchTerms]);

  const pinnedItem = useMemo(() => {
    if (!pinnedId) return undefined;
    return buildMessageListItems(entries).find((it) => it.id === pinnedId);
  }, [entries, pinnedId]);
  const metaByGroupId = useMemo(() => {
    const map = new Map<string, { latencyMs?: number; highlight?: LogEntry['highlight'] }>();
    for (const entry of entries) {
      if (!entry.groupId) continue;
      const existing = map.get(entry.groupId) ?? {};
      if (entry.latencyMs !== undefined) existing.latencyMs = entry.latencyMs;
      if (entry.highlight !== undefined) existing.highlight = entry.highlight;
      map.set(entry.groupId, existing);
    }
    return map;
  }, [entries]);

  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollDeadlineRef = useRef<number>(0);

  function viewportEl(): HTMLElement | null {
    return scrollRootRef.current?.querySelector('[data-slot="scroll-area-viewport"]') ?? null;
  }

  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`log-row-${selectedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId]);

  useEffect(() => {
    if (!followTail || items.length === 0) return;
    const last = items[items.length - 1];
    const el = document.getElementById(`log-row-${last.id}`);
    if (!el) return;
    const node = viewportEl();
    if (node) {
      const elBottom = el.getBoundingClientRect().bottom;
      const viewBottom = node.getBoundingClientRect().bottom;
      if (Math.abs(elBottom - viewBottom) < 4) return;
    }
    programmaticScrollDeadlineRef.current = Date.now() + 300;
    el.scrollIntoView({ block: 'end' });
  }, [followTail, items]);

  useEffect(() => {
    const node = viewportEl();
    if (!node || !followTail) return;
    const handler = () => {
      if (Date.now() < programmaticScrollDeadlineRef.current) return;
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (distance > TAIL_THRESHOLD_PX) setFollowTail(false);
    };
    node.addEventListener('scroll', handler, { passive: true });
    return () => node.removeEventListener('scroll', handler);
  }, [followTail, setFollowTail]);

  const moveBy = useCallback((currentIndex: number, delta: number) => {
    const next = items[Math.max(0, Math.min(items.length - 1, currentIndex + delta))];
    if (next) onSelect(next.id);
  }, [items, onSelect]);

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      <CardContent className="relative flex min-h-0 flex-1 flex-col px-0 pb-0">
        {items.length === 0 ? (
          <PaneEmpty
            icon={Terminal}
            title={entries.length === 0 ? 'No messages yet' : 'No messages match search'}
            description={
              entries.length === 0
                ? connected
                  ? 'Send a command to see live responses, ACKs, and change events.'
                  : 'Connect a panel from the sidebar to start streaming wire traffic.'
                : 'Refine the query (source:, tag:, level:, id:, cmd:) or clear it.'
            }
          />
        ) : (
          <ScrollArea className="min-h-0 flex-1" ref={scrollRootRef}>
            <div
              id="lares4-log-list"
              className="flex flex-col gap-0.5 px-2 py-2 pb-4"
              role="listbox"
              aria-label="Log messages"
              aria-activedescendant={selectedId ? `log-row-${selectedId}` : undefined}
              aria-keyshortcuts="ArrowUp ArrowDown PageUp PageDown Home End"
              tabIndex={0}
              onKeyDown={(event) => {
                if (items.length === 0) return;
                const index = Math.max(0, items.findIndex((item) => item.id === selectedId));
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveBy(index, -1);
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveBy(index, 1);
                }
                if (event.key === 'PageUp') {
                  event.preventDefault();
                  moveBy(index, -10);
                }
                if (event.key === 'PageDown') {
                  event.preventDefault();
                  moveBy(index, 10);
                }
                if (event.key === 'Home') {
                  event.preventDefault();
                  const next = items[0];
                  if (next) onSelect(next.id);
                }
                if (event.key === 'End') {
                  event.preventDefault();
                  const next = items[items.length - 1];
                  if (next) onSelect(next.id);
                }
              }}
            >
              {pinnedItem && annotationsLicensed && (
                <div className="bg-pane/90 sticky top-0 z-10 -mx-2 mb-1 px-2 pt-1 pb-1 backdrop-blur">
                  <Row
                    item={pinnedItem}
                    selected={pinnedItem.id === selectedId}
                    bookmarked={bookmarkedIds.has(pinnedItem.id)}
                    pinned
                    rowIdPrefix="pinned-log-row"
                    meta={metaByGroupId.get(pinnedItem.id)}
                    annotationsLicensed={annotationsLicensed}
                    searchTerms={searchTerms}
                    searchMatch={matchByItemId?.get(pinnedItem.id)}
                    onSelect={onSelect}
                    onToggleBookmark={onToggleBookmark}
                    onTogglePin={() => onPinnedIdChange(undefined)}
                  />
                </div>
              )}
              {items.map((item, idx) => (
                <Row
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  bookmarked={bookmarkedIds.has(item.id)}
                  pinned={item.id === pinnedId}
                  rowIdPrefix="log-row"
                  meta={metaByGroupId.get(item.id)}
                  annotationsLicensed={annotationsLicensed}
                  searchTerms={searchTerms}
                  searchMatch={matchByItemId?.get(item.id)}
                  animateEnter={animateFromIndex(idx, items.length)}
                  expanded={expandedIds.has(item.id)}
                  onToggleExpand={toggleExpand}
                  onSelect={onSelect}
                  onToggleBookmark={onToggleBookmark}
                  onTogglePin={() => onPinnedIdChange(pinnedId === item.id ? undefined : item.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
        {connected && items.length > 0 && (
          <div className="border-border/60 bg-pane/80 flex shrink-0 items-center justify-center border-t px-2 py-1.5 backdrop-blur">
            <Button
              type="button"
              size="sm"
              variant={followTail ? 'secondary' : 'default'}
              aria-pressed={followTail}
              className="h-7 gap-1.5 rounded-full px-3 text-xs shadow-sm"
              onClick={() => setFollowTail((v) => !v)}
            >
              {followTail ? (
                <>
                  <Pause className="size-3.5" aria-hidden />
                  Pause
                </>
              ) : (
                <>
                  <ArrowDownToLine className="size-3.5" aria-hidden />
                  Jump to live
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RowProps {
  item: ReturnType<typeof buildMessageListItems>[number];
  selected: boolean;
  bookmarked: boolean;
  pinned: boolean;
  rowIdPrefix: string;
  meta?: { latencyMs?: number; highlight?: LogEntry['highlight'] };
  annotationsLicensed: boolean;
  searchTerms: string[];
  searchMatch?: boolean;
  animateEnter?: boolean;
  expanded?: boolean;
  onSelect: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onTogglePin: () => void;
  onToggleExpand?: (id: string) => void;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightFragment(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi');
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <mark
          key={i}
          className="rounded bg-[oklch(var(--accent)/0.35)] text-foreground px-0.5"
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

const HIGHLIGHT_BG: Record<NonNullable<LogEntry['highlight']>, string> = {
  red: 'bg-red-100/70 dark:bg-red-950/40 ring-1 ring-red-500/40',
  amber: 'bg-amber-100/70 dark:bg-amber-950/40 ring-1 ring-amber-500/40',
  emerald: 'bg-emerald-100/70 dark:bg-emerald-950/40 ring-1 ring-emerald-500/40',
  blue: 'bg-blue-100/70 dark:bg-blue-950/40 ring-1 ring-blue-500/40',
  violet: 'bg-violet-100/70 dark:bg-violet-950/40 ring-1 ring-violet-500/40',
};

function Row({
  item, selected, bookmarked, pinned, rowIdPrefix, meta,
  annotationsLicensed,
  searchTerms, searchMatch, animateEnter,
  expanded, onToggleExpand,
  onSelect, onToggleBookmark, onTogglePin,
}: RowProps) {
  const isError = item.tag === 'ERROR';
  const Icon = getTagIcon(item.tag);
  const highlightCls = meta?.highlight ? HIGHLIGHT_BG[meta.highlight] : undefined;
  const hasSearch = searchTerms.length > 0;
  const isMatch = hasSearch && searchMatch === true;
  const isDimmed = hasSearch && searchMatch === false;
  const hasChildren = (item.children?.length ?? 0) > 0;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <>
    <motion.div
      id={`${rowIdPrefix}-${item.id}`}
      role="option"
      aria-selected={selected}
      initial={animateEnter ? { opacity: 0, y: 4 } : false}
      animate={animateEnter ? { opacity: 1, y: 0 } : undefined}
      transition={animateEnter ? { duration: 0.12, ease: [0.22, 1, 0.36, 1] } : undefined}
      className={cn(
        'hover:bg-muted/80 group relative grid min-h-9 w-full cursor-pointer items-center gap-x-3 rounded-lg border border-transparent pr-2 pl-3 py-1 text-left transition-[opacity,background-color,box-shadow]',
        'grid-cols-[1rem_minmax(4rem,max-content)_4.5rem_minmax(0,1fr)_auto_auto]',
        isError && !selected && 'bg-red-50/60 dark:bg-red-950/30',
        highlightCls && !selected && highlightCls,
        selected && 'shadow-sm',
        pinned && !selected && 'border-primary/40 ring-1 ring-primary/25',
        isMatch && !selected && 'ring-1 ring-[oklch(var(--accent)/0.55)] bg-[oklch(var(--accent)/0.06)]',
        isDimmed && 'opacity-45',
      )}
      style={selected
        ? {
            backgroundColor: 'var(--row-selected-bg)',
            boxShadow: 'inset 2px 0 0 0 var(--row-selected-bar)',
          }
        : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.currentTarget.parentElement?.focus();
        onSelect(item.id);
      }}
    >
      <Icon className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
      <LogTagChip tag={item.tag} />
      <span className="text-muted-foreground font-mono text-meta tabular-nums opacity-70">
        {formatLogClock(item.ts)}
      </span>
      <span
        className="min-w-0 truncate text-row leading-snug flex items-center"
        style={{
          maskImage: 'linear-gradient(to right, black 92%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, black 92%, transparent)',
        }}
      >
        {hasChildren && onToggleExpand && (
          <button
            type="button"
            aria-label={expanded ? 'Collapse items' : 'Expand items'}
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground mr-1 shrink-0 rounded p-0.5"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand(item.id);
            }}
          >
            <Chevron className="size-3.5" aria-hidden />
          </button>
        )}
        <span className="min-w-0 truncate">
          {hasSearch ? highlightFragment(item.preview, searchTerms) : item.preview}
          {item.repeat !== undefined && item.repeat > 1 && (
            <span className="text-muted-foreground ml-1.5 font-mono text-meta tabular-nums">×{item.repeat}</span>
          )}
        </span>
      </span>
      <div className="flex shrink-0 items-center">
        {item.ack ? (
          <span
            className={cn(
              'shrink-0 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-wide leading-tight tabular-nums',
              ackResultChipClasses(item.ack.result),
            )}
            title={`ACK ${item.ack.result ?? ''}${item.ack.latencyMs !== undefined ? ` · ${item.ack.latencyMs}ms` : ''}`.trim()}
          >
            <span className="font-semibold">{item.ack.result ?? 'ACK'}</span>
            {item.ack.latencyMs !== undefined && <span className="font-normal">{item.ack.latencyMs}ms</span>}
          </span>
        ) : meta?.latencyMs !== undefined ? (
          <span
            className="bg-muted/70 text-muted-foreground border-border/50 shrink-0 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-wide leading-tight tabular-nums"
            title="Round-trip latency"
          >
            {meta.latencyMs}ms
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100',
          selected || pinned || bookmarked
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100',
        )}
      >
        {annotationsLicensed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={pinned ? 'Unpin row' : 'Pin row to top'}
                  aria-pressed={pinned}
                  className={cn(
                    'rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted',
                    pinned && 'opacity-100 text-primary',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePin();
                  }}
                >
                  <Pin className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>{pinned ? 'Unpin row' : 'Pin to top'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark row'}
                  aria-pressed={bookmarked}
                  className={cn(
                    'rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted',
                    bookmarked && 'opacity-100 text-amber-500',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleBookmark(item.id);
                  }}
                >
                  <Star className={cn('size-3.5', bookmarked && 'fill-current')} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>{bookmarked ? 'Remove bookmark' : 'Bookmark'}</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <ProFeatureLock
            featureId="annotations"
            label="Pin & bookmarks"
            variant="icon"
            tooltip="Pin & bookmarks — unlock annotations"
            className="size-7"
          />
        )}
      </div>
    </motion.div>
    {hasChildren && expanded && (
      <div role="presentation" className="text-muted-foreground border-border/40 ml-[7.5rem] mt-0.5 mb-1 flex flex-col gap-0.5 border-l py-1 pl-3 font-mono text-row leading-snug">
        {item.children!.map((child) => (
          <div key={child.key} className="truncate">{child.line}</div>
        ))}
      </div>
    )}
    </>
  );
}

