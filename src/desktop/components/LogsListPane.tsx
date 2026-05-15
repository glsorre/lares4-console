import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownToLine, Pause, Terminal } from 'lucide-react';
import { PaneEmpty } from './PaneEmpty.js';
import { useConnectionStatus } from '../runtime/session-store.js';
import { buildMessageListItems } from '../../core/log-view.js';
import { compileChipFilters, extractFreeTextTerms } from '../../core/log-query.js';
import type { LogEntry } from '../../core/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { LogRow, ROW_ENTER_CAP } from './LogRow.js';

const TAIL_THRESHOLD_PX = 24;
const ESTIMATED_ROW_HEIGHT = 38;
const ROW_OVERSCAN = 8;

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
  disableVirtualization?: boolean;
}

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
  disableVirtualization = false,
}: LogsListPaneProps) {
  const { t } = useTranslation();
  const { connected } = useConnectionStatus();
  const [followTail, setFollowTail] = useState<boolean>(true);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
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
      map.set(it.id, searchTerms.some((term) => haystack.includes(term)));
    }
    return map;
  }, [items, searchTerms]);

  const pinnedItem = useMemo(() => {
    if (!pinnedId) return undefined;
    return buildMessageListItems(entries).find((it) => it.id === pinnedId);
  }, [entries, pinnedId]);
  const metaByGroupId = useMemo(() => {
    const map = new Map<string, { highlight?: LogEntry['highlight'] }>();
    for (const entry of entries) {
      if (!entry.groupId) continue;
      const existing = map.get(entry.groupId) ?? {};
      if (entry.highlight !== undefined) existing.highlight = entry.highlight;
      map.set(entry.groupId, existing);
    }
    return map;
  }, [entries]);

  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollDeadlineRef = useRef<number>(0);

  const viewportEl = useCallback((): HTMLElement | null => {
    return scrollRootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;
  }, []);

  const virtualizer = useVirtualizer({
    count: disableVirtualization ? 0 : items.length,
    getScrollElement: viewportEl,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!disableVirtualization) {
      requestAnimationFrame(() => virtualizer.measure());
    }
  }, [disableVirtualization, virtualizer]);

  useEffect(() => {
    if (!selectedId) return;
    if (disableVirtualization) {
      document.getElementById(`log-row-${selectedId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const idx = items.findIndex((it) => it.id === selectedId);
    if (idx < 0) return;
    programmaticScrollDeadlineRef.current = Date.now() + 300;
    virtualizer.scrollToIndex(idx, { align: 'auto' });
  }, [selectedId, items, virtualizer, disableVirtualization]);

  useEffect(() => {
    if (!followTail || items.length === 0) return;
    if (disableVirtualization) {
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
      return;
    }
    programmaticScrollDeadlineRef.current = Date.now() + 300;
    virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
  }, [followTail, items, virtualizer, viewportEl, disableVirtualization]);

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
  }, [followTail, viewportEl]);

  const moveBy = useCallback((currentIndex: number, delta: number) => {
    const next = items[Math.max(0, Math.min(items.length - 1, currentIndex + delta))];
    if (next) onSelect(next.id);
  }, [items, onSelect]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      <CardContent className="relative flex min-h-0 flex-1 flex-col px-0 pb-0">
        {items.length === 0 ? (
          <PaneEmpty
            icon={Terminal}
            title={entries.length === 0 ? t('logs.emptyTitle') : t('logs.noMatchTitle')}
            description={
              entries.length === 0
                ? connected
                  ? t('logs.descNoEntriesConnected')
                  : t('logs.descNoEntriesDisconnected')
                : t('logs.descRefineQuery')
            }
          />
        ) : (
          <ScrollArea className="min-h-0 flex-1" ref={scrollRootRef}>
            <div
              id="lares4-log-list"
              className={cn(
                'px-2 py-2 pb-4',
                disableVirtualization && 'flex flex-col gap-0.5',
              )}
              role="listbox"
              aria-label={t('logs.listAriaLabel')}
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
                  <LogRow
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
              {disableVirtualization ? (
                items.map((item, idx) => (
                  <LogRow
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
                ))
              ) : (
                <div
                  style={{ height: totalSize, position: 'relative', width: '100%' }}
                >
                  {virtualItems.map((virtualItem) => {
                    const item = items[virtualItem.index];
                    if (!item) return null;
                    return (
                      <div
                        key={virtualItem.key}
                        ref={virtualizer.measureElement}
                        data-index={virtualItem.index}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualItem.start}px)`,
                          paddingBottom: 2,
                        }}
                      >
                        <LogRow
                          item={item}
                          selected={item.id === selectedId}
                          bookmarked={bookmarkedIds.has(item.id)}
                          pinned={item.id === pinnedId}
                          rowIdPrefix="log-row"
                          meta={metaByGroupId.get(item.id)}
                          annotationsLicensed={annotationsLicensed}
                          searchTerms={searchTerms}
                          searchMatch={matchByItemId?.get(item.id)}
                          animateEnter={false}
                          expanded={expandedIds.has(item.id)}
                          onToggleExpand={toggleExpand}
                          onSelect={onSelect}
                          onToggleBookmark={onToggleBookmark}
                          onTogglePin={() => onPinnedIdChange(pinnedId === item.id ? undefined : item.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
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
                  {t('logs.pause')}
                </>
              ) : (
                <>
                  <ArrowDownToLine className="size-3.5" aria-hidden />
                  {t('logs.jumpToLive')}
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
