import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  ChevronDown,
  CornerDownLeft,
  Info,
  Layers,
  Pause,
  Pin,
  Star,
  Terminal,
} from 'lucide-react';
import { ProFeatureLock } from './ProFeatureLock';
import { buildMessageListItems, formatLogClock } from '../../core/log-view.js';
import { compileLogQuery } from '../../core/log-query.js';
import { entrySource } from '../../core/types.js';
import type { LogEntry, LogSource, LogTag } from '../../core/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getTagClasses, getTagDotClass } from '../runtime/log-tag-classes.js';

const ALL_TAGS: LogTag[] = ['ACK', 'CHANGE', 'BULK', 'RAW_RX', 'LOG', 'RAW_TX', 'ERROR', 'SYSTEM'];
const TAIL_THRESHOLD_PX = 24;

export type LogSourceFilter = 'all' | LogSource;
const SOURCE_FILTERS: ReadonlyArray<{ value: LogSourceFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'command', label: 'Commands' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'wire', label: 'Wire' },
];
const SOURCE_LABEL: Record<LogSourceFilter, string> = {
  all: 'All sources',
  command: 'Commands',
  lifecycle: 'Lifecycle',
  wire: 'Wire',
};

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
  tagFilters: LogTag[] | undefined;
  onTagFiltersChange: (next: LogTag[] | undefined) => void;
  sourceFilter: LogSourceFilter;
  onSourceFilterChange: (next: LogSourceFilter) => void;
  searchInput: string;
  bookmarkedIds: ReadonlySet<string>;
  onToggleBookmark: (id: string) => void;
  pinnedId: string | undefined;
  onPinnedIdChange: (id: string | undefined) => void;
  annotationsLicensed: boolean;
}

export function LogsListPane({
  entries,
  selectedId,
  onSelect,
  tagFilters,
  onTagFiltersChange,
  sourceFilter,
  onSourceFilterChange,
  searchInput,
  bookmarkedIds,
  onToggleBookmark,
  pinnedId,
  onPinnedIdChange,
  annotationsLicensed,
}: LogsListPaneProps) {
  const [followTail, setFollowTail] = useState<boolean>(true);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  const sourceCounts = useMemo(() => {
    const map: Record<LogSource, number> = { command: 0, lifecycle: 0, wire: 0 };
    for (const entry of entries) map[entrySource(entry)] += 1;
    return map;
  }, [entries]);

  const sourceFilteredEntries = useMemo(() => {
    if (sourceFilter === 'all') return entries;
    return entries.filter((entry) => entrySource(entry) === sourceFilter);
  }, [entries, sourceFilter]);

  const tagCounts = useMemo(() => {
    const map = new Map<LogTag, number>();
    for (const entry of sourceFilteredEntries) map.set(entry.tag, (map.get(entry.tag) ?? 0) + 1);
    return map;
  }, [sourceFilteredEntries]);

  const compiledQuery = useMemo(() => compileLogQuery(searchInput), [searchInput]);

  const filteredEntries = useMemo(() => {
    if (compiledQuery.isEmpty) return sourceFilteredEntries;
    return sourceFilteredEntries.filter((entry) => compiledQuery.predicate(entry));
  }, [sourceFilteredEntries, compiledQuery]);

  const allItems = useMemo(() => buildMessageListItems(filteredEntries), [filteredEntries]);

  const items = useMemo(() => {
    if (tagFilters === undefined) return allItems;
    return allItems.filter((it) => tagFilters.includes(it.tag) || it.id === selectedId);
  }, [allItems, tagFilters, selectedId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 't') {
        event.preventDefault();
        setTagPopoverOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const activeTagSet = useMemo<Set<LogTag>>(
    () => new Set(tagFilters ?? ALL_TAGS),
    [tagFilters],
  );
  const activeTagCount = activeTagSet.size;

  const setTagActive = useCallback((tag: LogTag, active: boolean) => {
    const current = new Set<LogTag>(activeTagSet);
    if (active) current.add(tag);
    else current.delete(tag);
    if (current.size === ALL_TAGS.length) onTagFiltersChange(undefined);
    else onTagFiltersChange(ALL_TAGS.filter((t) => current.has(t)));
  }, [activeTagSet, onTagFiltersChange]);

  const searchActive = !compiledQuery.isEmpty;
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
      <div className="border-border/60 flex shrink-0 flex-col gap-1.5 border-b px-3 py-1.5">
      <div className="flex min-h-[34px] flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        spacing={0}
        variant="outline"
        size="sm"
        value={sourceFilter}
        onValueChange={(value) => {
          if (value === 'all' || value === 'command' || value === 'lifecycle' || value === 'wire') {
            onSourceFilterChange(value);
          }
        }}
        className="mr-auto bg-transparent shadow-none"
        aria-label="Filter by message source"
      >
        {SOURCE_FILTERS.map((opt) => {
          const count = opt.value === 'all'
            ? entries.length
            : sourceCounts[opt.value];
          return (
            <ToggleGroupItem
              key={opt.value}
              value={opt.value}
              aria-label={opt.label}
              className={cn(
                'gap-1.5 px-2 text-xs text-muted-foreground',
                'data-[state=on]:bg-[oklch(var(--accent)/0.12)]',
                'data-[state=on]:text-foreground',
                'data-[state=on]:ring-1 data-[state=on]:ring-[oklch(var(--accent)/0.45)]',
              )}
            >
              {opt.label}
              <span
                className={cn(
                  'rounded px-1 font-mono text-[0.6rem] tabular-nums',
                  'bg-muted text-muted-foreground',
                  'group-data-[state=on]:bg-[oklch(var(--accent)/0.20)]',
                  'group-data-[state=on]:text-foreground',
                )}
              >
                {count}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
        <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs font-medium"
                  aria-label="Filter by tag"
                  aria-keyshortcuts="Meta+T Control+T"
                >
                  <span className="text-muted-foreground">Tags</span>
                  <span className="font-mono tabular-nums">
                    {activeTagCount}/{ALL_TAGS.length}
                  </span>
                  <span className="flex items-center gap-0.5" aria-hidden>
                    {ALL_TAGS.filter((t) => activeTagSet.has(t)).slice(0, 4).map((t) => (
                      <span key={t} className={cn('size-1.5 rounded-full', getTagDotClass(t))} />
                    ))}
                  </span>
                  <ChevronDown className="size-3.5 opacity-60" aria-hidden />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Filter tags (⌘T)</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-64 p-0">
            <Command>
              <CommandInput placeholder="Filter tags…" />
              <div className="flex flex-col gap-1 border-b border-border/40 px-2 py-1.5">
                <span className="text-foreground text-xs font-medium">
                  Tags <span className="text-muted-foreground">·</span>{' '}
                  <span className="text-muted-foreground">{SOURCE_LABEL[sourceFilter]}</span>
                </span>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {activeTagCount} of {ALL_TAGS.length} on
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => onTagFiltersChange(undefined)}
                    >
                      All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => onTagFiltersChange([])}
                    >
                      None
                    </Button>
                  </div>
                </div>
              </div>
              <CommandList>
                <CommandEmpty>No tag matches.</CommandEmpty>
                {ALL_TAGS.map((tag) => {
                  const active = activeTagSet.has(tag);
                  const count = tagCounts.get(tag) ?? 0;
                  return (
                    <CommandItem
                      key={tag}
                      value={tag}
                      data-checked={active}
                      onSelect={() => setTagActive(tag, !active)}
                      className="font-mono text-xs"
                    >
                      <span className={cn('size-2 shrink-0 rounded-full', getTagDotClass(tag))} aria-hidden />
                      <span className={cn('flex-1', !active && 'text-muted-foreground')}>{tag}</span>
                      <span className="text-muted-foreground tabular-nums">{count}</span>
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 w-7 shrink-0 p-0 text-muted-foreground',
                followTail && 'text-foreground',
              )}
              onClick={() => setFollowTail(!followTail)}
              aria-label={followTail ? 'Pause auto-scroll' : 'Follow tail'}
              aria-pressed={followTail}
            >
              {followTail
                ? <ArrowDownToLine className="size-3.5" aria-hidden />
                : <Pause className="size-3.5" aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{followTail ? 'Pause auto-scroll' : 'Follow tail'}</TooltipContent>
        </Tooltip>
      </div>
      </div>
      <CardContent className="relative flex min-h-0 flex-1 flex-col px-0 pb-0">
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="bg-muted/50 text-muted-foreground/50 flex size-9 items-center justify-center rounded-full">
              <Activity className="size-4" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-foreground/75 text-sm font-medium">
                {entries.length === 0
                  ? 'No messages yet'
                  : searchActive ? 'No messages match search' : 'No messages match filters'}
              </p>
              <p className="text-muted-foreground max-w-[16rem] text-xs leading-relaxed">
                {entries.length === 0
                  ? 'Run a command to see responses and events.'
                  : searchActive
                    ? 'Refine your query or clear it to see all matching messages.'
                    : 'Toggle a tag chip above to show those messages.'}
              </p>
            </div>
          </div>
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
                    stickyHidden={false}
                    rowIdPrefix="pinned-log-row"
                    meta={metaByGroupId.get(pinnedItem.id)}
                    annotationsLicensed={annotationsLicensed}
                    onSelect={onSelect}
                    onToggleBookmark={onToggleBookmark}
                    onTogglePin={() => onPinnedIdChange(undefined)}
                  />
                </div>
              )}
              {items.map((item) => {
                const stickyHidden = tagFilters !== undefined && !tagFilters.includes(item.tag);
                return (
                  <Row
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    bookmarked={bookmarkedIds.has(item.id)}
                    pinned={item.id === pinnedId}
                    stickyHidden={stickyHidden}
                    rowIdPrefix="log-row"
                    meta={metaByGroupId.get(item.id)}
                    annotationsLicensed={annotationsLicensed}
                    onSelect={onSelect}
                    onToggleBookmark={onToggleBookmark}
                    onTogglePin={() => onPinnedIdChange(pinnedId === item.id ? undefined : item.id)}
                  />
                );
              })}
            </div>
          </ScrollArea>
        )}
        {!followTail && items.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="pointer-events-auto h-7 gap-1.5 rounded-full px-3 text-xs shadow-md"
              onClick={() => setFollowTail(true)}
            >
              <ArrowDownToLine className="size-3.5" aria-hidden />
              Jump to live
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
  stickyHidden: boolean;
  rowIdPrefix: string;
  meta?: { latencyMs?: number; highlight?: LogEntry['highlight'] };
  annotationsLicensed: boolean;
  onSelect: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onTogglePin: () => void;
}

const HIGHLIGHT_BG: Record<NonNullable<LogEntry['highlight']>, string> = {
  red: 'bg-red-100/70 dark:bg-red-950/40 ring-1 ring-red-500/40',
  amber: 'bg-amber-100/70 dark:bg-amber-950/40 ring-1 ring-amber-500/40',
  emerald: 'bg-emerald-100/70 dark:bg-emerald-950/40 ring-1 ring-emerald-500/40',
  blue: 'bg-blue-100/70 dark:bg-blue-950/40 ring-1 ring-blue-500/40',
  violet: 'bg-violet-100/70 dark:bg-violet-950/40 ring-1 ring-violet-500/40',
};

function Row({
  item, selected, bookmarked, pinned, stickyHidden, rowIdPrefix, meta,
  annotationsLicensed,
  onSelect, onToggleBookmark, onTogglePin,
}: RowProps) {
  const isError = item.tag === 'ERROR';
  const Icon = getTagIcon(item.tag);
  const highlightCls = meta?.highlight ? HIGHLIGHT_BG[meta.highlight] : undefined;
  return (
    <div
      id={`${rowIdPrefix}-${item.id}`}
      role="option"
      aria-selected={selected}
      className={cn(
        'hover:bg-muted/80 border-border/40 group grid w-full cursor-pointer items-center gap-x-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors',
        'grid-cols-[1rem_5rem_3.5rem_1fr_auto]',
        isError && !selected && 'bg-red-50/60 dark:bg-red-950/30',
        highlightCls && !selected && highlightCls,
        selected && 'border-primary/35 bg-accent/35 shadow-sm ring-1 ring-primary/20',
        pinned && 'border-primary/50 ring-1 ring-primary/30',
        stickyHidden && 'italic opacity-60',
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.currentTarget.parentElement?.focus();
        onSelect(item.id);
      }}
    >
      <Icon className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-center font-mono text-[0.65rem] font-semibold tracking-wide uppercase',
          getTagClasses(item.tag),
        )}
      >
        {item.tag}
      </span>
      <span className="text-muted-foreground font-mono text-[0.65rem] tabular-nums opacity-70">
        {formatLogClock(item.ts)}
      </span>
      <span className="min-w-0 truncate text-sm leading-snug">
        {item.preview}
        {item.repeat !== undefined && item.repeat > 1 && (
          <span className="text-muted-foreground ml-1.5 font-mono text-[0.7rem] tabular-nums">×{item.repeat}</span>
        )}
        {meta?.latencyMs !== undefined && (
          <span
            className="bg-muted/70 text-muted-foreground border-border/50 ml-1.5 inline-flex items-center gap-0.5 rounded border px-1 py-0 align-middle font-mono text-[0.6rem] tabular-nums"
            title="Round-trip latency"
          >
            {meta.latencyMs}ms
          </span>
        )}
      </span>
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
    </div>
  );
}
