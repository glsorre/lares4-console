import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutputFormat, useReadOnly } from '../runtime/session-store.js';
import { suggestCompletions } from '../../core/autocomplete.js';
import { applySuggestion } from './command-pane-apply.js';
import { AutocompletePopover } from './AutocompletePopover.js';
import { type AutocompleteGroup } from './AutocompleteList.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CommandPaneProps {
  command: string;
  onCommandChange: (value: string) => void;
  onSubmit: () => void;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
}

export function CommandPane({
  command,
  onCommandChange,
  onSubmit,
  onHistoryUp,
  onHistoryDown,
}: CommandPaneProps) {
  const { t } = useTranslation();
  const outputFormat = useOutputFormat();
  const readOnly = useReadOnly();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canRun = command.trim().length > 0;
  const outputNonDefault = outputFormat !== 'pretty';

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
              {t('command.inputLabel')}
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
                placeholder={t('command.placeholder')}
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
                  {outputFormat}
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
                  {t('command.run')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-mono text-meta">{t('command.keyEnter')}</span> {t('command.actRun')} ·{' '}
                <span className="font-mono text-meta">{t('command.keyTab')}</span> {t('command.actComplete')} ·{' '}
                <span className="font-mono text-meta">{t('command.keyArrows')}</span> {t('command.actHistory')}
              </TooltipContent>
            </Tooltip>
          </div>
          );
        }}
      </AutocompletePopover>
      {readOnly && (
        <p className="mt-1.5 px-1 text-meta text-amber-700 dark:text-amber-300">
          {t('command.readOnlyHint')}
        </p>
      )}
      {!command && !popoverOpen && !readOnly && (
        <p className="text-muted-foreground/70 mt-1.5 px-1 text-meta">
          <span className="font-mono">{t('command.keyTab')}</span> {t('command.actAutocomplete')} ·{' '}
          <span className="font-mono">{t('command.keyArrows')}</span> {t('command.actHistory')} ·{' '}
          <span className="font-mono">{t('command.keyEnter')}</span> {t('command.actRun')}
        </p>
      )}
    </div>
  );
}
