import { useCallback, useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

export type AutocompleteKeyResult = 'handled' | 'fallthrough';

export interface UseAutocompleteOptions {
  itemCount: number;
  open: boolean;
  onPick: (index: number) => void;
  onDismiss?: () => void;
  acceptKeys?: ReadonlyArray<string>;
}

export interface UseAutocompleteReturn {
  activeIndex: number;
  setActiveIndex: (next: number) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => AutocompleteKeyResult;
  pickActive: () => void;
}

const DEFAULT_ACCEPT: ReadonlyArray<string> = ['Tab'];

export function useAutocomplete(options: UseAutocompleteOptions): UseAutocompleteReturn {
  const { itemCount, open, onPick, onDismiss, acceptKeys = DEFAULT_ACCEPT } = options;
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    if (itemCount === 0) {
      setActiveIndex(-1);
      return;
    }
    if (activeIndex >= itemCount) setActiveIndex(itemCount - 1);
  }, [open, itemCount, activeIndex]);

  const pickActive = useCallback(() => {
    if (!open || itemCount === 0) return;
    const target = activeIndex < 0 ? 0 : activeIndex;
    onPick(target);
  }, [open, itemCount, activeIndex, onPick]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>): AutocompleteKeyResult => {
      const { key } = event;
      if (key === 'ArrowDown') {
        if (!open || itemCount === 0) return 'fallthrough';
        event.preventDefault();
        setActiveIndex((i) => (i < 0 ? 0 : Math.min(itemCount - 1, i + 1)));
        return 'handled';
      }
      if (key === 'ArrowUp') {
        if (!open || itemCount === 0) return 'fallthrough';
        event.preventDefault();
        setActiveIndex((i) => (i <= 0 ? 0 : i - 1));
        return 'handled';
      }
      if (key === 'Home') {
        if (!open || itemCount === 0) return 'fallthrough';
        event.preventDefault();
        setActiveIndex(0);
        return 'handled';
      }
      if (key === 'End') {
        if (!open || itemCount === 0) return 'fallthrough';
        event.preventDefault();
        setActiveIndex(itemCount - 1);
        return 'handled';
      }
      if (key === 'Escape') {
        if (!open) return 'fallthrough';
        event.preventDefault();
        onDismiss?.();
        return 'handled';
      }
      if (acceptKeys.includes(key)) {
        if (!open || itemCount === 0) return 'fallthrough';
        event.preventDefault();
        const target = activeIndex < 0 ? 0 : activeIndex;
        onPick(target);
        return 'handled';
      }
      return 'fallthrough';
    },
    [open, itemCount, activeIndex, onPick, onDismiss, acceptKeys],
  );

  return { activeIndex, setActiveIndex, handleKeyDown, pickActive };
}
