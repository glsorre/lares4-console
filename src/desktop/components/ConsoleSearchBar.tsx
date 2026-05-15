import { useCallback, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Hash, Search, Signal, Tag as TagIcon, Terminal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
import { getTagDotClass } from '../runtime/log-tag-classes.js';
import { AutocompletePopover, type AutocompletePickHelpers } from './AutocompletePopover.js';
import { type AutocompleteGroup, type AutocompleteItem } from './AutocompleteList.js';

interface ConsoleSearchBarProps {
  value: string;
  onChange: (next: string) => void;
  entries: LogEntry[];
  inputRef: RefObject<HTMLInputElement | null>;
  pulse: boolean;
}

export function ConsoleSearchBar({ value, onChange, entries, inputRef, pulse }: ConsoleSearchBarProps) {
  const compiledQuery = useMemo(() => compileLogQuery(value), [value]);

  return (
    <div className="order-3 flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto lg:flex-1 lg:max-w-xl">
      <SearchChipsInput
        value={value}
        onChange={onChange}
        entries={entries}
        inputRef={inputRef}
        pulse={pulse}
        error={compiledQuery.error}
      />
      {compiledQuery.error && (
        <span className="text-destructive shrink-0 font-mono text-[0.65rem]" role="alert">
          {compiledQuery.error}
        </span>
      )}
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

const KEY_HINT_KEYS: ReadonlyArray<{ key: ChipKind; hintKey: string }> = [
  { key: 'source', hintKey: 'search.sourceHint' },
  { key: 'tag', hintKey: 'search.tagHint' },
  { key: 'level', hintKey: 'search.levelHint' },
  { key: 'id', hintKey: 'search.idHint' },
  { key: 'cmd', hintKey: 'search.cmdHint' },
];

const KEY_RE = /(?:^|\s)(tag|source|level|id|cmd):(\S*)$/i;

interface SuggestionHandlers {
  commitChip: (chip: ChipToken) => void;
  selectKey: (key: ChipKind) => void;
}

interface SuggestionContext {
  partial: { key: ChipKind; fragment: string } | null;
  trailing: string;
  counts: {
    tag: ReadonlyMap<LogTag, number>;
    source: ReadonlyMap<LogSource, number>;
    level: ReadonlyMap<LogLevel, number>;
  };
  alreadySelected: ReadonlySet<string>;
}

interface SuggestionAction {
  run: () => void;
  commits: boolean;
}

interface BuiltSuggestions {
  groups: AutocompleteGroup[];
  actions: SuggestionAction[];
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

function buildSuggestions(ctx: SuggestionContext, handlers: SuggestionHandlers, t: TFn): BuiltSuggestions {
  const groups: AutocompleteGroup[] = [];
  const actions: SuggestionAction[] = [];

  if (ctx.partial) {
    const { key, fragment } = ctx.partial;
    const frag = fragment.toLowerCase();

    if (key === 'tag') {
      const matches = TAG_VALUES.filter((tag) => tag.toLowerCase().startsWith(frag));
      if (matches.length === 0) return { groups: [], actions: [] };
      const items: AutocompleteItem[] = matches.map((tag) => {
        const raw = `tag:${tag}`;
        const used = ctx.alreadySelected.has(raw);
        actions.push({
          run: () => handlers.commitChip({ kind: 'tag', value: tag, raw }),
          commits: true,
        });
        return {
          key: `tag-${tag}`,
          disabled: used,
          label: (
            <>
              <span className={cn('size-1.5 rounded-full', getTagDotClass(tag))} aria-hidden />
              <span className={cn('ml-1', used && 'text-muted-foreground line-through')}>{tag}</span>
            </>
          ),
          trailing: (
            <span className="text-muted-foreground ml-auto tabular-nums">{ctx.counts.tag.get(tag) ?? 0}</span>
          ),
        };
      });
      groups.push({ heading: t('search.tagHeading'), items });
      return { groups, actions };
    }

    if (key === 'source') {
      const matches = SOURCE_VALUES.filter((s) => s.startsWith(frag));
      if (matches.length === 0) return { groups: [], actions: [] };
      const items: AutocompleteItem[] = matches.map((src) => {
        const raw = `source:${src}`;
        const used = ctx.alreadySelected.has(raw);
        actions.push({
          run: () => handlers.commitChip({ kind: 'source', value: src, raw }),
          commits: true,
        });
        return {
          key: `source-${src}`,
          disabled: used,
          label: (
            <span className={cn('text-foreground', used && 'text-muted-foreground line-through')}>{src}</span>
          ),
          trailing: (
            <span className="text-muted-foreground ml-auto tabular-nums">{ctx.counts.source.get(src) ?? 0}</span>
          ),
        };
      });
      groups.push({ heading: t('search.sourceHeading'), items });
      return { groups, actions };
    }

    if (key === 'level') {
      const matches = LEVEL_VALUES.filter((l) => l.startsWith(frag));
      if (matches.length === 0) return { groups: [], actions: [] };
      const items: AutocompleteItem[] = matches.map((lvl) => {
        const raw = `level:${lvl}`;
        const used = ctx.alreadySelected.has(raw);
        actions.push({
          run: () => handlers.commitChip({ kind: 'level', value: lvl, raw }),
          commits: true,
        });
        return {
          key: `level-${lvl}`,
          disabled: used,
          label: (
            <span className={cn('text-foreground', used && 'text-muted-foreground line-through')}>{lvl}</span>
          ),
          trailing: (
            <span className="text-muted-foreground ml-auto tabular-nums">{ctx.counts.level.get(lvl) ?? 0}</span>
          ),
        };
      });
      groups.push({ heading: t('search.levelHeading'), items });
      return { groups, actions };
    }

    actions.push({ run: () => {}, commits: false });
    groups.push({
      heading: key === 'id' ? t('search.deviceIdHeading') : t('search.commandHeading'),
      items: [
        {
          key: `${key}-hint`,
          disabled: true,
          label: (
            <span className="text-muted-foreground font-sans text-[0.7rem]">
              {t('search.freeformHelp')}
            </span>
          ),
        },
      ],
    });
    return { groups, actions };
  }

  const fragment = ctx.trailing.trim().toLowerCase();
  const filtered = fragment
    ? KEY_HINT_KEYS.filter(({ key }) => key.startsWith(fragment))
    : KEY_HINT_KEYS;
  if (filtered.length === 0) return { groups: [], actions: [] };
  const items: AutocompleteItem[] = filtered.map(({ key, hintKey }) => {
    actions.push({ run: () => handlers.selectKey(key), commits: false });
    return {
      key: `key-${key}`,
      label: (
        <>
          <span className="text-foreground">{key}:</span>
          <span className="text-muted-foreground ml-2 font-sans text-[0.7rem]">{t(hintKey)}</span>
        </>
      ),
    };
  });
  groups.push({ heading: t('search.filterByHeading'), items });
  return { groups, actions };
}

function SearchChipsInput({ value, onChange, entries, inputRef, pulse, error }: SearchChipsInputProps) {
  const { t } = useTranslation();
  const split = useMemo(() => splitQuery(value), [value]);
  const trailing = split.trailing;
  const [focused, setFocused] = useState(false);

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

  const setTrailing = useCallback(
    (next: string) => {
      onChange(joinQuery({ chips: split.chips, trailing: next }));
    },
    [onChange, split.chips],
  );

  const removeChip = useCallback(
    (raw: string) => {
      onChange(removeChipFromInput(value, raw));
    },
    [onChange, value],
  );

  const commitChip = useCallback(
    (chip: ChipToken) => {
      const stripped = trailing.replace(KEY_RE, '').trimStart();
      const base = joinQuery({ chips: split.chips, trailing: stripped });
      onChange(addChip(base, chip));
      queueMicrotask(() => inputRef.current?.focus());
    },
    [trailing, split.chips, onChange, inputRef],
  );

  const alreadySelected = useMemo(
    () => new Set(split.chips.map((c) => c.raw)),
    [split.chips],
  );

  const { groups, actions } = useMemo(
    () =>
      buildSuggestions(
        { partial, trailing, counts, alreadySelected },
        {
          commitChip,
          selectKey: (key) => setTrailing(`${key}:`),
        },
        t,
      ),
    [partial, trailing, counts, alreadySelected, commitChip, setTrailing, t],
  );

  const handlePick = useCallback(
    (index: number, helpers: AutocompletePickHelpers) => {
      const action = actions[index];
      if (!action) return;
      action.run();
      if (action.commits) helpers.commit();
    },
    [actions],
  );

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <Search className="text-muted-foreground pointer-events-none absolute left-2 z-10 size-3.5" aria-hidden />
      <AutocompletePopover
        groups={groups}
        value={trailing}
        focused={focused}
        onPick={handlePick}
        side="bottom"
        idPrefix="lares4-filter"
      >
        {(api) => (
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
              {...api.inputProps}
              ref={inputRef}
              value={trailing}
              onChange={(event) => setTrailing(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && trailing.length === 0 && split.chips.length > 0) {
                  event.preventDefault();
                  removeChip(split.chips[split.chips.length - 1].raw);
                  return;
                }
                const result = api.handleKeyDown(event);
                if (result === 'handled') {
                  if (event.key === 'Escape') event.stopPropagation();
                  return;
                }
                if (event.key === 'ArrowDown' && !api.open) {
                  event.preventDefault();
                  api.reopen();
                }
              }}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              aria-keyshortcuts="Meta+F Control+F"
              aria-label={t('search.label')}
              aria-invalid={error ? true : undefined}
              placeholder={split.chips.length === 0 ? t('search.placeholder') : ''}
              className="min-w-[6rem] flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground"
            />
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground absolute right-1 top-1/2 z-10 h-5 w-5 -translate-y-1/2 p-0"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange('');
                }}
                aria-label={t('search.clearAria')}
                title={t('search.clearAria')}
              >
                <X className="size-3" aria-hidden />
              </Button>
            )}
          </div>
        )}
      </AutocompletePopover>
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
  const { t } = useTranslation();
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
        aria-label={t('search.removeFilterAria', { raw: chip.raw })}
      >
        <X className="size-2.5" aria-hidden />
      </button>
    </span>
  );
}
