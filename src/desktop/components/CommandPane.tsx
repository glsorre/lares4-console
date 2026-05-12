import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionSnapshot } from '../runtime/session-controller.js';
import { applyCompletion, suggestCompletions } from '../../core/autocomplete.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatReplayLabel } from '../runtime/status-chips.js';

interface CommandPaneProps {
  snapshot: SessionSnapshot;
  command: string;
  onCommandChange: (value: string) => void;
  onSubmit: () => void;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
}

export function CommandPane({
  snapshot,
  command,
  onCommandChange,
  onSubmit,
  onHistoryUp,
  onHistoryDown,
}: CommandPaneProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canRun = command.trim().length > 0;
  const replayActive = snapshot.replayStatus && snapshot.replayStatus !== 'off';
  const outputNonDefault = snapshot.outputFormat !== 'pretty';
  const showMeta = replayActive || outputNonDefault;
  const meta = replayActive
    ? `Replay ${formatReplayLabel(snapshot.replayStatus)}`
    : `output ${snapshot.outputFormat}`;

  const suggestions = useMemo(() => suggestCompletions(command).slice(0, 8), [command]);
  const open = focused && !dismissed && suggestions.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [command]);

  const apply = useCallback((index: number) => {
    const suggestion = suggestions[index];
    if (suggestion === undefined) return;
    const next = applyCompletion(command, suggestion);
    onCommandChange(next);
    setActiveIndex(-1);
    setDismissed(false);
    inputRef.current?.focus();
  }, [command, onCommandChange, suggestions]);

  return (
    <Card
      size="sm"
      className="border-border/70 from-card to-muted/25 shrink-0 overflow-visible shadow-md ring-1 ring-border/55"
    >
      <CardContent className="space-y-2 pt-4">
        {showMeta && (
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-foreground font-medium tracking-tight">Command</span>
            <span className="font-mono text-[0.65rem] opacity-80" title={meta}>
              {meta}
            </span>
          </div>
        )}
        <div className="relative">
          <div className="flex items-center gap-3">
            <label htmlFor="lares4-command-input" className="sr-only">
              Command input
            </label>
            <div className="focus-within:ring-ring bg-background/80 flex min-h-10 flex-1 items-stretch gap-0 overflow-hidden rounded-lg border border-border/80 shadow-inner transition-shadow focus-within:ring-2">
              <span
                className="text-muted-foreground bg-muted/50 border-border/60 flex w-9 shrink-0 items-center justify-center border-r font-mono text-sm font-semibold select-none"
                aria-hidden
              >
                &gt;
              </span>
              <Input
                id="lares4-command-input"
                ref={inputRef}
                className="min-h-10 flex-1 rounded-none border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                value={command}
                autoComplete="off"
                spellCheck={false}
                placeholder="state all"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls="lares4-command-suggestions"
                aria-activedescendant={open && activeIndex >= 0 ? `sugg-${String(activeIndex)}` : undefined}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(event) => {
                  onCommandChange(event.target.value);
                  setDismissed(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Tab') {
                    if (open) {
                      event.preventDefault();
                      apply(activeIndex < 0 ? 0 : activeIndex);
                    }
                    return;
                  }
                  if (event.key === 'Escape') {
                    if (open) {
                      event.preventDefault();
                      setDismissed(true);
                      setActiveIndex(-1);
                    }
                    return;
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    if (open) {
                      setActiveIndex((i) => Math.min(suggestions.length - 1, (i < 0 ? -1 : i) + 1));
                    } else {
                      onHistoryDown();
                    }
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (open) {
                      setActiveIndex((i) => Math.max(0, (i < 0 ? 0 : i) - 1));
                    } else {
                      onHistoryUp();
                    }
                    return;
                  }
                  if (event.key === 'Enter') {
                    if (open && activeIndex >= 0) {
                      event.preventDefault();
                      apply(activeIndex);
                    } else {
                      onSubmit();
                    }
                  }
                }}
              />
            </div>
            <Button
              type="button"
              className="h-10 min-w-[5.5rem] shrink-0"
              disabled={!canRun}
              onClick={onSubmit}
            >
              Run
            </Button>
          </div>
          {open && (
            <div
              role="listbox"
              id="lares4-command-suggestions"
              className="bg-popover absolute inset-x-0 bottom-full z-10 mb-2 max-h-56 overflow-y-auto rounded-lg border border-border/70 shadow-lg ring-1 ring-border/40"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  id={`sugg-${String(i)}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(event) => { event.preventDefault(); apply(i); }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs transition-colors',
                    'hover:bg-accent/40',
                    i === activeIndex && 'bg-accent/60 text-accent-foreground',
                  )}
                >
                  <span>{s}</span>
                  {i === activeIndex && (
                    <span className="text-muted-foreground text-[0.6rem]">⇥ apply</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-muted-foreground text-[0.65rem] leading-snug">
          <kbd className="bg-muted rounded px-1 py-0.5 font-mono">Enter</kbd> run ·{' '}
          <kbd className="bg-muted rounded px-1 py-0.5 font-mono">Tab</kbd> complete ·{' '}
          <kbd className="bg-muted rounded px-1 py-0.5 font-mono">↑</kbd>{' '}
          <kbd className="bg-muted rounded px-1 py-0.5 font-mono">↓</kbd> history / nav
        </p>
      </CardContent>
    </Card>
  );
}
