import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAutocomplete, type AutocompleteKeyResult } from '../hooks/use-autocomplete.js';
import {
  AutocompleteList,
  autocompleteFlatCount,
  type AutocompleteGroup,
} from './AutocompleteList.js';

export interface AutocompletePickHelpers {
  dismiss: () => void;
  commit: () => void;
  reopen: () => void;
}

export interface AutocompleteAnchorApi {
  inputProps: {
    role: 'combobox';
    'aria-autocomplete': 'list';
    'aria-expanded': boolean;
    'aria-controls': string;
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => AutocompleteKeyResult;
  };
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => AutocompleteKeyResult;
  open: boolean;
  activeIndex: number;
  dismiss: () => void;
  commit: () => void;
  reopen: () => void;
}

export interface AutocompletePopoverProps {
  groups: ReadonlyArray<AutocompleteGroup>;
  value: string;
  focused: boolean;
  onPick: (flatIndex: number, helpers: AutocompletePickHelpers) => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  acceptKeys?: ReadonlyArray<string>;
  emptyText?: string;
  idPrefix?: string;
  contentClassName?: string;
  children: (api: AutocompleteAnchorApi) => ReactElement;
}

export function AutocompletePopover({
  groups,
  value,
  focused,
  onPick,
  side = 'bottom',
  align = 'start',
  acceptKeys,
  emptyText,
  idPrefix = 'lares4-ac',
  contentClassName,
  children,
}: AutocompletePopoverProps) {
  const [dismissed, setDismissed] = useState(false);
  const skipNextResetRef = useRef(0);

  useEffect(() => {
    if (skipNextResetRef.current > 0) {
      skipNextResetRef.current -= 1;
      return;
    }
    setDismissed(false);
  }, [value]);

  const flatCount = useMemo(() => autocompleteFlatCount(groups), [groups]);
  const open = focused && flatCount > 0 && !dismissed;

  const helpers = useMemo<AutocompletePickHelpers>(
    () => ({
      dismiss: () => setDismissed(true),
      commit: () => {
        skipNextResetRef.current = 1;
        setDismissed(true);
      },
      reopen: () => setDismissed(false),
    }),
    [],
  );

  const onPickInternal = useCallback(
    (index: number) => {
      onPick(index, helpers);
    },
    [onPick, helpers],
  );

  const { activeIndex, setActiveIndex, handleKeyDown } = useAutocomplete({
    itemCount: flatCount,
    open,
    onPick: onPickInternal,
    onDismiss: () => setDismissed(true),
    acceptKeys,
  });

  const listId = `${idPrefix}-listbox`;

  const api: AutocompleteAnchorApi = {
    inputProps: {
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': open,
      'aria-controls': listId,
      onKeyDown: handleKeyDown,
    },
    handleKeyDown,
    open,
    activeIndex,
    dismiss: helpers.dismiss,
    commit: helpers.commit,
    reopen: helpers.reopen,
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setDismissed(true);
      }}
    >
      <PopoverAnchor asChild>{children(api)}</PopoverAnchor>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={6}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
        className={cn(
          'w-(--radix-popover-trigger-width) min-w-[16rem] gap-0 overflow-hidden rounded-lg border border-border/70 bg-popover p-1 shadow-lg ring-1 ring-border/40',
          contentClassName,
        )}
      >
        <AutocompleteList
          id={listId}
          groups={groups}
          activeIndex={activeIndex}
          onActiveChange={setActiveIndex}
          onPick={onPickInternal}
          emptyText={emptyText}
        />
      </PopoverContent>
    </Popover>
  );
}
