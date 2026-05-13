import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import {
  Eraser,
  Globe,
  Hash,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Radio,
  Search,
  Signal,
  Tag as TagIcon,
  Terminal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { computeLogStats } from '../../core/log-stats.js';
import {
  LEVEL_VALUES,
  SOURCE_VALUES,
  TAG_VALUES,
  addChip,
  compileLogQuery,
  joinQuery,
  removeChipFromInput,
  splitQuery,
} from '../../core/log-query.js';
import type { ChipKind, ChipToken } from '../../core/log-query.js';
import { entrySource } from '../../core/types.js';
import type { LogEntry, LogLevel, LogSource, LogTag } from '../../core/types.js';
import { formatReplayLabel } from '../runtime/status-chips.js';
import { getTagDotClass } from '../runtime/log-tag-classes.js';
import type { SessionSnapshot } from '../runtime/session-controller.js';
import { StatsCluster } from './StatsBar.js';

interface ConsoleTopBarProps {
  snapshot: SessionSnapshot;
  msgCount: number;
  sidebarOpen: boolean;
  topologyRailOpen: boolean;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  searchPulseKey?: number;
  onToggleSidebar: () => void;
  onToggleTopologyRail: () => void;
  onClearLogs: () => void;
  onSelectTopId: (id: string) => void;
}

export function ConsoleTopBar({
  snapshot,
  msgCount,
  sidebarOpen,
  topologyRailOpen,
  searchInput,
  onSearchInputChange,
  searchPulseKey,
  onToggleSidebar,
  onToggleTopologyRail,
  onClearLogs,
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
    const handler = (event: globalThis.KeyboardEvent) => {
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

      {/* Middle: log search with chip tokens */}
      {snapshot.connected && (
        <div className="order-3 flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto lg:flex-1 lg:max-w-xl">
          <SearchChipsInput
            value={searchInput}
            onChange={onSearchInputChange}
            entries={snapshot.logEntries}
            inputRef={searchInputRef}
            pulse={pulse}
            error={compiledQuery.error}
          />
          {compiledQuery.error && (
            <span className="text-destructive shrink-0 font-mono text-[0.65rem]" role="alert">
              {compiledQuery.error}
            </span>
          )}
        </div>
      )}

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

        {snapshot.connected && !topologyRailOpen && (
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

interface SearchChipsInputProps {
  value: string;
  onChange: (next: string) => void;
  entries: LogEntry[];
  inputRef: RefObject<HTMLInputElement | null>;
  pulse: boolean;
  error?: string;
}

const KEY_HINTS: ReadonlyArray<{ key: ChipKind; hint: string }> = [
  { key: 'source', hint: 'filter by origin (command, lifecycle, wire)' },
  { key: 'tag', hint: 'filter by message type' },
  { key: 'level', hint: 'filter by log level' },
  { key: 'id', hint: 'find a device ID in payload' },
  { key: 'cmd', hint: 'filter by command name' },
];

const KEY_RE = /(?:^|\s)(tag|source|level|id|cmd):(\S*)$/i;

function SearchChipsInput({ value, onChange, entries, inputRef, pulse, error }: SearchChipsInputProps) {
  const split = useMemo(() => splitQuery(value), [value]);
  const trailing = split.trailing;
  const [open, setOpen] = useState(false);
  const justCommittedRef = useRef(false);

  const counts = useMemo(() => {
    const tag = new Map<LogTag, number>();
    const source = new Map<LogSource, number>();
    const level = new Map<LogLevel, number>();
    for (const e of entries) {
      tag.set(e.tag, (tag.get(e.tag) ?? 0) + 1);
      const s = entrySource(e);
      source.set(s, (source.get(s) ?? 0) + 1);
      level.set(e.level, (level.get(e.level) ?? 0) + 1);
    }
    return { tag, source, level };
  }, [entries]);

  const partial = useMemo(() => {
    const m = KEY_RE.exec(trailing);
    if (!m) return null;
    return { key: m[1].toLowerCase() as ChipKind, fragment: m[2] };
  }, [trailing]);

  const setTrailing = (next: string) => {
    onChange(joinQuery({ chips: split.chips, trailing: next }));
  };

  const removeChip = (raw: string) => {
    onChange(removeChipFromInput(value, raw));
  };

  const commitChip = (chip: ChipToken) => {
    const stripped = trailing.replace(KEY_RE, '').trimStart();
    const base = joinQuery({ chips: split.chips, trailing: stripped });
    onChange(addChip(base, chip));
    setOpen(false);
    justCommittedRef.current = true;
    queueMicrotask(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (open && trailing.length === 0 && partial === null) {
      setOpen(false);
    }
  }, [open, trailing, partial]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && trailing.length === 0 && split.chips.length > 0) {
      event.preventDefault();
      removeChip(split.chips[split.chips.length - 1].raw);
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' && !open) {
      setOpen(true);
    }
  };

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <Search className="text-muted-foreground pointer-events-none absolute left-2 z-10 size-3.5" aria-hidden />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              'flex min-h-7 w-full flex-wrap items-center gap-1 rounded-md border bg-background pl-7 pr-7 py-0.5 transition-shadow',
              'focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-input',
              pulse && 'ring-2 ring-[oklch(var(--accent)/0.55)]',
              error && 'border-destructive/60 ring-destructive/30',
            )}
            onClick={() => inputRef.current?.focus()}
          >
            {split.chips.map((chip) => (
              <ChipPill key={chip.raw} chip={chip} onRemove={() => removeChip(chip.raw)} />
            ))}
            <input
              ref={inputRef}
              value={trailing}
              onChange={(event) => {
                setTrailing(event.target.value);
                if (event.target.value.length > 0 && !open) setOpen(true);
              }}
              onFocus={() => {
                if (justCommittedRef.current) {
                  justCommittedRef.current = false;
                  return;
                }
                if (trailing.length > 0 || partial !== null) setOpen(true);
              }}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              aria-keyshortcuts="Meta+F Control+F"
              aria-label="Search log entries"
              aria-invalid={error ? true : undefined}
              placeholder={split.chips.length === 0 ? 'Search or filter  (⌘F)' : ''}
              className="min-w-[6rem] flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
        </PopoverAnchor>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground absolute right-1 top-1/2 z-10 h-5 w-5 -translate-y-1/2 p-0"
            onClick={() => onChange('')}
            aria-label="Clear search"
            title="Clear search"
          >
            <X className="size-3" aria-hidden />
          </Button>
        )}
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-80 p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Command shouldFilter={false} className="bg-transparent">
            <CommandList>
              <CommandEmpty>No suggestions.</CommandEmpty>
              {partial ? (
                <SuggestionValues
                  partial={partial}
                  counts={counts}
                  alreadySelected={new Set(split.chips.map((c) => c.raw))}
                  onPick={commitChip}
                />
              ) : (
                <SuggestionKeys
                  fragment={trailing.trim()}
                  onPick={(key) => setTrailing(`${key}:`)}
                />
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const CHIP_KIND_VISUALS: Record<ChipKind, { Icon: typeof TagIcon; classes: string }> = {
  tag: {
    Icon: TagIcon,
    classes:
      'border-[oklch(var(--accent)/0.55)] bg-[oklch(var(--accent)/0.14)] text-foreground',
  },
  source: {
    Icon: Globe,
    classes:
      'border-violet-500/45 bg-violet-500/12 text-violet-900 dark:text-violet-100',
  },
  level: {
    Icon: Signal,
    classes: 'border-border/60 bg-muted/60 text-foreground',
  },
  id: {
    Icon: Hash,
    classes:
      'border-cyan-500/45 bg-cyan-500/12 text-cyan-900 dark:text-cyan-100',
  },
  cmd: {
    Icon: Terminal,
    classes:
      'border-emerald-500/45 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100',
  },
};

const LEVEL_CHIP_CLASSES: Record<LogLevel, string> = {
  error: 'border-red-500/45 bg-red-500/12 text-red-900 dark:text-red-100',
  warn: 'border-amber-500/45 bg-amber-500/12 text-amber-900 dark:text-amber-100',
  info: 'border-sky-500/45 bg-sky-500/12 text-sky-900 dark:text-sky-100',
  debug: 'border-slate-500/45 bg-slate-500/12 text-slate-900 dark:text-slate-100',
};

function ChipPill({ chip, onRemove }: { chip: ChipToken; onRemove: () => void }) {
  const visual = CHIP_KIND_VISUALS[chip.kind];
  const cls = chip.kind === 'level'
    ? LEVEL_CHIP_CLASSES[chip.value as LogLevel] ?? visual.classes
    : visual.classes;
  const Icon = visual.Icon;
  return (
    <span
      className={cn(
        'group inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 font-mono text-[0.65rem] shadow-sm/0 transition-[box-shadow,background-color] hover:shadow-sm',
        cls,
      )}
      title={chip.raw}
    >
      <Icon className="size-3 opacity-70" aria-hidden />
      {chip.kind === 'tag' && (
        <span
          className={cn('size-1.5 rounded-full', getTagDotClass(chip.value as LogTag))}
          aria-hidden
        />
      )}
      <span className="opacity-60">{chip.kind}:</span>
      <span className="font-semibold tracking-tight">{chip.value}</span>
      <button
        type="button"
        className="-mr-0.5 inline-flex size-3.5 items-center justify-center rounded opacity-70 hover:bg-foreground/10 hover:opacity-100"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={onRemove}
        aria-label={`Remove filter ${chip.raw}`}
      >
        <X className="size-2.5" aria-hidden />
      </button>
    </span>
  );
}

interface SuggestionKeysProps {
  fragment: string;
  onPick: (key: ChipKind) => void;
}

function SuggestionKeys({ fragment, onPick }: SuggestionKeysProps) {
  const filtered = fragment
    ? KEY_HINTS.filter(({ key }) => key.startsWith(fragment.toLowerCase()))
    : KEY_HINTS;
  if (filtered.length === 0) {
    return null;
  }
  return (
    <CommandGroup heading="Filter by">
      {filtered.map(({ key, hint }) => (
        <CommandItem
          key={key}
          value={key}
          onSelect={() => onPick(key)}
          className="font-mono text-xs"
        >
          <span className="text-foreground">{key}:</span>
          <span className="text-muted-foreground ml-2 font-sans text-[0.7rem]">{hint}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

interface SuggestionValuesProps {
  partial: { key: ChipKind; fragment: string };
  counts: { tag: Map<LogTag, number>; source: Map<LogSource, number>; level: Map<LogLevel, number> };
  alreadySelected: ReadonlySet<string>;
  onPick: (chip: ChipToken) => void;
}

function SuggestionValues({ partial, counts, alreadySelected, onPick }: SuggestionValuesProps) {
  const { key, fragment } = partial;
  const frag = fragment.toLowerCase();

  if (key === 'tag') {
    const matches = TAG_VALUES.filter((t) => t.toLowerCase().startsWith(frag));
    if (matches.length === 0) return null;
    return (
      <CommandGroup heading="Tag">
        {matches.map((tag) => {
          const raw = `tag:${tag}`;
          const used = alreadySelected.has(raw);
          return (
            <CommandItem
              key={tag}
              value={tag}
              disabled={used}
              onSelect={() => onPick({ kind: 'tag', value: tag, raw })}
              className="font-mono text-xs"
            >
              <span className={cn('size-1.5 rounded-full', getTagDotClass(tag))} aria-hidden />
              <span className={cn('ml-1', used && 'text-muted-foreground line-through')}>{tag}</span>
              <span className="text-muted-foreground ml-auto tabular-nums">{counts.tag.get(tag) ?? 0}</span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    );
  }

  if (key === 'source') {
    const matches = SOURCE_VALUES.filter((s) => s.startsWith(frag));
    if (matches.length === 0) return null;
    return (
      <CommandGroup heading="Source">
        {matches.map((src) => {
          const raw = `source:${src}`;
          const used = alreadySelected.has(raw);
          return (
            <CommandItem
              key={src}
              value={src}
              disabled={used}
              onSelect={() => onPick({ kind: 'source', value: src, raw })}
              className="font-mono text-xs"
            >
              <span className={cn('text-foreground', used && 'text-muted-foreground line-through')}>{src}</span>
              <span className="text-muted-foreground ml-auto tabular-nums">{counts.source.get(src) ?? 0}</span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    );
  }

  if (key === 'level') {
    const matches = LEVEL_VALUES.filter((l) => l.startsWith(frag));
    if (matches.length === 0) return null;
    return (
      <CommandGroup heading="Level">
        {matches.map((lvl) => {
          const raw = `level:${lvl}`;
          const used = alreadySelected.has(raw);
          return (
            <CommandItem
              key={lvl}
              value={lvl}
              disabled={used}
              onSelect={() => onPick({ kind: 'level', value: lvl, raw })}
              className="font-mono text-xs"
            >
              <span className={cn('text-foreground', used && 'text-muted-foreground line-through')}>{lvl}</span>
              <span className="text-muted-foreground ml-auto tabular-nums">{counts.level.get(lvl) ?? 0}</span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    );
  }

  return (
    <CommandGroup heading={key === 'id' ? 'Device ID' : 'Command'}>
      <CommandItem disabled className="text-muted-foreground font-sans text-[0.7rem]">
        Type a value and press Space to commit.
      </CommandItem>
    </CommandGroup>
  );
}
