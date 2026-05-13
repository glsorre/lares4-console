import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionSnapshot } from '../runtime/session-controller.js';
import { applyCompletion, suggestCompletions } from '../../core/autocomplete.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
  const outputNonDefault = snapshot.outputFormat !== 'pretty';

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
    <div className="relative shrink-0">
      <div className="relative flex items-center gap-2">
        <label htmlFor="lares4-command-input" className="sr-only">
          Command input
        </label>
        <div
          className={cn(
            'group/dock relative flex min-h-10 flex-1 items-stretch overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-inner transition-shadow',
            'focus-within:border-[oklch(var(--accent)/0.55)] focus-within:shadow-[0_0_0_1px_oklch(var(--accent)/0.35),0_8px_24px_-12px_oklch(var(--accent)/0.6)]',
          )}
        >
          <span
            className="text-muted-foreground bg-muted/40 border-border/50 flex w-9 shrink-0 items-center justify-center border-r font-mono text-sm font-semibold select-none group-focus-within/dock:text-foreground"
            aria-hidden
          >
            &gt;
          </span>
          <Input
            id="lares4-command-input"
            ref={inputRef}
            className="min-h-10 flex-1 rounded-none border-0 bg-transparent font-mono text-sm shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0 dark:bg-transparent"
            value={command}
            autoComplete="off"
            spellCheck={false}
            placeholder="Type a command — try state all, lights on 1, or help"
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
                onSubmit();
                setDismissed(true);
                return;
              }
            }}
          />
          {outputNonDefault && (
            <span className="bg-muted/40 text-muted-foreground border-border/50 flex shrink-0 items-center border-l px-2 font-mono text-[0.65rem] uppercase tracking-wide">
              {snapshot.outputFormat}
            </span>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              className="h-10 min-w-[5rem] shrink-0 transition-transform active:scale-[0.97]"
              disabled={!canRun}
              onClick={onSubmit}
            >
              Run
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span className="font-mono text-meta">Enter</span> run ·{' '}
            <span className="font-mono text-meta">Tab</span> complete ·{' '}
            <span className="font-mono text-meta">↑↓</span> history
          </TooltipContent>
        </Tooltip>
      </div>
      {!command && !open && (
        <p className="text-muted-foreground/70 mt-1.5 px-1 text-meta">
          <span className="font-mono">Tab</span> autocomplete · <span className="font-mono">↑↓</span> history · <span className="font-mono">Enter</span> run
        </p>
      )}
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
  );
}
