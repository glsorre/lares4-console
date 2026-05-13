import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Bookmark as BookmarkIcon,
  Eraser,
  Hash,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Radio,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { computeLogStats } from '../../core/log-stats.js';
import { compileLogQuery } from '../../core/log-query.js';
import { formatReplayLabel } from '../runtime/status-chips.js';
import type { SessionSnapshot } from '../runtime/session-controller.js';
import { ProFeatureLock } from './ProFeatureLock.js';
import { StatsCluster } from './StatsBar.js';

const ID_FILTER_RE = /^id:(\S+)/i;

function extractIdFilter(input: string): { id: string; rest: string } | undefined {
  const match = ID_FILTER_RE.exec(input);
  if (!match) return undefined;
  const id = match[1];
  const rest = input.slice(match[0].length).replace(/^\s+/, '');
  return { id, rest };
}

interface ConsoleTopBarProps {
  snapshot: SessionSnapshot;
  msgCount: number;
  sidebarOpen: boolean;
  topologyRailOpen: boolean;
  bookmarkCount: number;
  annotationsLicensed: boolean;
  triggersLicensed: boolean;
  enabledTriggerCount: number;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  searchPulseKey?: number;
  onToggleSidebar: () => void;
  onToggleTopologyRail: () => void;
  onClearLogs: () => void;
  onOpenTriggers: () => void;
  onOpenBookmarks: () => void;
  onSelectTopId: (id: string) => void;
}

export function ConsoleTopBar({
  snapshot,
  msgCount,
  sidebarOpen,
  topologyRailOpen,
  bookmarkCount,
  annotationsLicensed,
  triggersLicensed,
  enabledTriggerCount,
  searchInput,
  onSearchInputChange,
  searchPulseKey,
  onToggleSidebar,
  onToggleTopologyRail,
  onClearLogs,
  onOpenTriggers,
  onOpenBookmarks,
  onSelectTopId,
}: ConsoleTopBarProps) {
  const [tick, setTick] = useState(0);
  const [pulse, setPulse] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (searchPulseKey === undefined) return;
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 900);
    return () => window.clearTimeout(t);
  }, [searchPulseKey]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        const node = searchInputRef.current;
        if (!node) return;
        event.preventDefault();
        node.focus();
        node.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const topIds = useMemo(() => {
    void tick;
    return computeLogStats(snapshot.logEntries, { windowMs: 5000, topIdsLimit: 8 }).topIds;
  }, [snapshot.logEntries, tick]);

  const idFilter = useMemo(() => extractIdFilter(searchInput), [searchInput]);
  const compiledQuery = useMemo(() => compileLogQuery(searchInput), [searchInput]);

  const deviceCount = snapshot.topology.total;
  const replayActive = snapshot.replayStatus && snapshot.replayStatus !== 'off';

  return (
    <div
      className={cn(
        'relative flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-1.5',
        'border-border/70 bg-pane/40 ring-1 ring-border/35',
        'bg-gradient-to-r from-pane/55 via-pane/30 to-pane/55',
        'after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-[oklch(var(--accent)/0.35)] after:to-transparent',
      )}
      aria-live="polite"
    >
      {/* Left: identity + stats */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 w-7 shrink-0 p-0"
              onClick={onToggleSidebar}
              aria-label={sidebarOpen ? 'Close connections panel' : 'Open connections panel'}
              aria-pressed={sidebarOpen}
            >
              {sidebarOpen
                ? <PanelLeftClose className="size-4" aria-hidden />
                : <PanelLeftOpen className="size-4" aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebarOpen ? 'Hide connections' : 'Show connections'}</TooltipContent>
        </Tooltip>

        {snapshot.connected && (
          <>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              <span className="text-foreground">{msgCount}</span> {msgCount === 1 ? 'msg' : 'msgs'}
            </span>
            <StatsCluster entries={snapshot.logEntries} pendingTxCount={snapshot.pendingTxCount} />
            {replayActive ? (
              <div
                className="inline-flex items-center gap-1.5 rounded-md bg-background/60 ring-1 ring-border/40 px-2 py-0.5 text-xs text-muted-foreground"
                title="Replay status"
              >
                <Radio className="size-3.5 opacity-70" aria-hidden />
                <span>replay</span>
                <span className="text-foreground font-mono">{formatReplayLabel(snapshot.replayStatus)}</span>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Middle: log search */}
      <div className="order-3 flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto lg:flex-1 lg:max-w-md">
        <div
          className={cn(
            'relative flex min-w-0 flex-1 items-center rounded-md transition-shadow',
            pulse && 'ring-2 ring-[oklch(var(--accent)/0.55)]',
          )}
        >
          <Search className="text-muted-foreground pointer-events-none absolute left-2 z-10 size-3.5" aria-hidden />
          {idFilter && (
            <button
              type="button"
              onClick={() => onSearchInputChange(idFilter.rest)}
              className="bg-[oklch(var(--accent)/0.15)] text-foreground ring-1 ring-[oklch(var(--accent)/0.35)] absolute left-7 z-10 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[0.65rem]"
              aria-label={`Clear id filter ${idFilter.id}`}
              title="Clear id filter"
            >
              id:{idFilter.id}
              <X className="size-2.5" aria-hidden />
            </button>
          )}
          <Input
            ref={searchInputRef}
            type="search"
            placeholder={idFilter ? 'Add query…' : 'Search logs  (⌘F)'}
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            aria-keyshortcuts="Meta+F Control+F"
            style={idFilter ? { paddingLeft: `${idFilter.id.length * 0.55 + 3.5}rem` } : undefined}
            className={cn(
              'h-7 pl-7 pr-7 font-mono text-xs',
              compiledQuery.error && 'border-destructive/60 ring-destructive/30',
            )}
            aria-label="Search log entries"
            aria-invalid={compiledQuery.error ? true : undefined}
          />
          {searchInput && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground absolute right-1 z-10 h-5 w-5 p-0"
              onClick={() => onSearchInputChange('')}
              aria-label="Clear search"
              title="Clear search"
            >
              <X className="size-3" aria-hidden />
            </Button>
          )}
        </div>
        {compiledQuery.error && (
          <span className="text-destructive shrink-0 font-mono text-[0.65rem]" role="alert">
            {compiledQuery.error}
          </span>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        {snapshot.connected && topIds.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground h-7 gap-1.5 text-xs"
                    aria-label="Top device IDs"
                  >
                    <Hash className="size-3.5" aria-hidden />
                    Top IDs
                    <span className="bg-muted text-muted-foreground rounded px-1 font-mono text-[0.6rem] tabular-nums">
                      {topIds.length}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Most-referenced IDs</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-wide">
                Top IDs · last 5s
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {topIds.map(({ id, count }) => (
                <DropdownMenuItem
                  key={id}
                  onSelect={() => onSelectTopId(id)}
                  className="font-mono text-xs"
                >
                  <span className="text-foreground">{id}</span>
                  <span className="text-muted-foreground ml-auto tabular-nums">×{count}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {annotationsLicensed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-7 gap-1.5 text-xs"
                onClick={onOpenBookmarks}
                aria-label="Open bookmarks"
              >
                <BookmarkIcon className="size-3.5" aria-hidden />
                Bookmarks
                {bookmarkCount > 0 && (
                  <span className="bg-muted text-muted-foreground rounded px-1 font-mono text-[0.6rem] tabular-nums">
                    {bookmarkCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bookmarks tab</TooltipContent>
          </Tooltip>
        ) : (
          <ProFeatureLock
            featureId="annotations"
            label="Bookmarks"
            tooltip="Bookmarks — unlock annotations"
          />
        )}

        {triggersLicensed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-7 gap-1.5 text-xs"
                onClick={onOpenTriggers}
                aria-label="Manage trigger rules"
              >
                <Bell className="size-3.5" aria-hidden />
                Triggers
                {enabledTriggerCount > 0 && (
                  <span className="bg-muted text-muted-foreground rounded px-1 font-mono text-[0.6rem] tabular-nums">
                    {enabledTriggerCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Trigger rules</TooltipContent>
          </Tooltip>
        ) : (
          <ProFeatureLock
            featureId="triggers"
            label="Triggers"
            tooltip="Triggers — unlock"
          />
        )}

        {msgCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-7 gap-1.5 text-xs"
                onClick={onClearLogs}
                aria-label="Clear logs"
              >
                <Eraser className="size-3.5" aria-hidden />
                Clear
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear log entries</TooltipContent>
          </Tooltip>
        )}

        {!topologyRailOpen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={onToggleTopologyRail}
                aria-label="Open devices rail"
                aria-pressed={topologyRailOpen}
              >
                <PanelRightOpen className="size-3.5" aria-hidden />
                Devices
                {deviceCount > 0 && (
                  <span className="bg-muted text-muted-foreground rounded px-1 font-mono text-[0.6rem] tabular-nums">
                    {deviceCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show topology rail</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
