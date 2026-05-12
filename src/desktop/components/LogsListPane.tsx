import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  CornerDownLeft,
  Info,
  Layers,
  Pause,
  Terminal,
} from 'lucide-react';
import { buildMessageListItems, formatLogClock } from '../../core/log-view.js';
import type { LogEntry, LogTag } from '../../core/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getTagClasses } from '../runtime/log-tag-classes.js';

const ALL_TAGS: LogTag[] = ['ACK', 'CHANGE', 'BULK', 'RAW_RX', 'LOG', 'RAW_TX', 'ERROR', 'SYSTEM'];
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
  tagFilters: LogTag[] | undefined;
  onTagFiltersChange: (next: LogTag[] | undefined) => void;
}

function tagVisible(filters: LogTag[] | undefined, tag: LogTag): boolean {
  return filters === undefined ? true : filters.includes(tag);
}

export function LogsListPane({
  entries,
  selectedId,
  onSelect,
  tagFilters,
  onTagFiltersChange,
}: LogsListPaneProps) {
  const [followTail, setFollowTail] = useState<boolean>(true);

  const allItems = useMemo(() => buildMessageListItems(entries), [entries]);

  const items = useMemo(() => {
    if (tagFilters === undefined) return allItems;
    return allItems.filter((it) => tagFilters.includes(it.tag) || it.id === selectedId);
  }, [allItems, tagFilters, selectedId]);

  const totalShown = items.length;
  const totalAll = allItems.length;

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

  const handleTagClick = useCallback((tag: LogTag) => {
    const filtersSet = tagFilters ?? ALL_TAGS;
    const allOn = tagFilters === undefined;
    const isActive = filtersSet.includes(tag);
    if (allOn) {
      onTagFiltersChange([tag]);
      return;
    }
    let next: LogTag[];
    if (isActive) next = filtersSet.filter((t) => t !== tag);
    else next = [...filtersSet, tag];
    if (next.length === ALL_TAGS.length) onTagFiltersChange(undefined);
    else onTagFiltersChange(next);
  }, [tagFilters, onTagFiltersChange]);

  const handleTagAll = useCallback(() => {
    if (tagFilters !== undefined) onTagFiltersChange(undefined);
  }, [tagFilters, onTagFiltersChange]);

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      <div className="border-border/60 flex h-[46px] shrink-0 items-center gap-2 border-b px-4">
        <span className="text-sm font-medium shrink-0">Live log</span>
        {totalAll > 0 && (
          <span className="text-muted-foreground font-mono text-xs tabular-nums shrink-0">
            {totalShown}{totalShown !== totalAll ? `/${totalAll}` : ''}
          </span>
        )}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex items-center gap-1 whitespace-nowrap">
            <button
              type="button"
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold tracking-wide uppercase transition-opacity',
                'border border-border/40 hover:bg-muted/60',
                tagFilters === undefined ? 'bg-muted/60 text-foreground' : 'text-muted-foreground opacity-70',
              )}
              onClick={handleTagAll}
              aria-pressed={tagFilters === undefined}
            >
              ALL
            </button>
            {ALL_TAGS.map((tag) => {
              const active = tagVisible(tagFilters, tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold tracking-wide uppercase transition-opacity',
                    getTagClasses(tag),
                    !active && 'opacity-30 grayscale',
                  )}
                  onClick={() => handleTagClick(tag)}
                  aria-pressed={active}
                  title={active ? `Hide ${tag}` : `Show ${tag}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
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
          title={followTail ? 'Pause auto-scroll' : 'Follow tail'}
        >
          {followTail
            ? <ArrowDownToLine className="size-3.5" aria-hidden />
            : <Pause className="size-3.5" aria-hidden />}
        </Button>
      </div>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="bg-muted/50 text-muted-foreground/50 flex size-9 items-center justify-center rounded-full">
              <Activity className="size-4" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-foreground/75 text-sm font-medium">
                {entries.length === 0 ? 'No messages yet' : 'No messages match filters'}
              </p>
              <p className="text-muted-foreground max-w-[14rem] text-xs leading-relaxed">
                {entries.length === 0
                  ? 'Run a command to see responses and events.'
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
              {items.map((item) => {
                const selected = item.id === selectedId;
                const isError = item.tag === 'ERROR';
                const stickyHidden = tagFilters !== undefined && !tagFilters.includes(item.tag);
                const Icon = getTagIcon(item.tag);
                return (
                  <div
                    key={item.id}
                    id={`log-row-${item.id}`}
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      'hover:bg-muted/80 border-border/40 grid w-full cursor-pointer items-center gap-x-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors',
                      'grid-cols-[1rem_5rem_3.5rem_1fr]',
                      isError && !selected && 'bg-red-50/60 dark:bg-red-950/30',
                      selected && 'border-primary/35 bg-accent/35 shadow-sm ring-1 ring-primary/20',
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
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
