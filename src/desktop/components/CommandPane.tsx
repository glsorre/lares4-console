import { useCallback, useMemo, useRef, useState } from 'react';
import type { SessionSnapshot } from '../runtime/session-controller.js';
import { suggestCompletions } from '../../core/autocomplete.js';
import { applySuggestion } from './command-pane-apply.js';
import { AutocompletePopover } from './AutocompletePopover.js';
import { type AutocompleteGroup } from './AutocompleteList.js';
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
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canRun = command.trim().length > 0;
  const outputNonDefault = snapshot.outputFormat !== 'pretty';

  const suggestions = useMemo(() => suggestCompletions(command).slice(0, 8), [command]);

  const apply = useCallback(
    (index: number) => {
      const next = applySuggestion(command, suggestions, index);
      if (next === null) return;
      onCommandChange(next);
      inputRef.current?.focus();
    },
    [command, onCommandChange, suggestions],
  );

  const groups = useMemo<AutocompleteGroup[]>(
    () => [
      {
        items: suggestions.map((s) => ({
          key: s,
          label: <span>{s}</span>,
        })),
      },
    ],
    [suggestions],
  );

  const popoverOpen = focused && suggestions.length > 0;

  return (
    <div className="relative shrink-0">
      <AutocompletePopover
        groups={groups}
        value={command}
        focused={focused}
        onPick={apply}
        side="top"
        idPrefix="lares4-command"
      >
        {(api) => {
          const runCommand = () => {
            api.commit();
            onSubmit();
          };
          return (
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
                {...api.inputProps}
                id="lares4-command-input"
                ref={inputRef}
                className="min-h-10 flex-1 rounded-none border-0 bg-transparent font-mono text-sm shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0 dark:bg-transparent"
                value={command}
                autoComplete="off"
                spellCheck={false}
                placeholder="Type a command — try state all, lights on 1, or help"
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(event) => onCommandChange(event.target.value)}
                onKeyDown={(event) => {
                  const result = api.handleKeyDown(event);
                  if (result === 'handled') return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    onHistoryDown();
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    onHistoryUp();
                    return;
                  }
                  if (event.key === 'Enter') {
                    runCommand();
                  }
                }}
              />
              {outputNonDefault && (
                <span className="bg-muted/40 text-muted-foreground border-border/50 flex shrink-0 items-center border-l px-2 font-mono text-xs uppercase tracking-wide">
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
                  onClick={runCommand}
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
          );
        }}
      </AutocompletePopover>
      {snapshot.readOnly && (
        <p className="mt-1.5 px-1 text-meta text-amber-700 dark:text-amber-300">
          Read-only mode — device commands are blocked. Local commands (format, events, replay, export) still run.
        </p>
      )}
      {!command && !popoverOpen && !snapshot.readOnly && (
        <p className="text-muted-foreground/70 mt-1.5 px-1 text-meta">
          <span className="font-mono">Tab</span> autocomplete · <span className="font-mono">↑↓</span> history · <span className="font-mono">Enter</span> run
        </p>
      )}
    </div>
  );
}
