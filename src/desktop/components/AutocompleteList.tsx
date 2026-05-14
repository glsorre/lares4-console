import type { ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface AutocompleteItem {
  key: string;
  label: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
}

export interface AutocompleteGroup {
  heading?: string;
  items: ReadonlyArray<AutocompleteItem>;
}

export interface AutocompleteListProps {
  groups: ReadonlyArray<AutocompleteGroup>;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onPick: (index: number) => void;
  emptyText?: string;
  className?: string;
  itemClassName?: string;
  id?: string;
}

function flattenGroups(groups: ReadonlyArray<AutocompleteGroup>): AutocompleteItem[] {
  const out: AutocompleteItem[] = [];
  for (const group of groups) for (const item of group.items) out.push(item);
  return out;
}

export function autocompleteFlatCount(groups: ReadonlyArray<AutocompleteGroup>): number {
  let n = 0;
  for (const g of groups) n += g.items.length;
  return n;
}

export function AutocompleteList({
  groups,
  activeIndex,
  onActiveChange,
  onPick,
  emptyText = 'No suggestions.',
  className,
  itemClassName,
  id,
}: AutocompleteListProps) {
  const flat = flattenGroups(groups);
  const selectedValue = activeIndex >= 0 && activeIndex < flat.length ? `i-${activeIndex}` : '';

  const handleValueChange = (next: string) => {
    if (!next) return;
    const m = /^i-(\d+)$/.exec(next);
    if (!m) return;
    const idx = Number(m[1]);
    if (Number.isFinite(idx) && idx !== activeIndex) onActiveChange(idx);
  };

  return (
    <Command
      shouldFilter={false}
      value={selectedValue}
      onValueChange={handleValueChange}
      className={cn('bg-transparent', className)}
      id={id}
    >
      <CommandList>
        {flat.length === 0 ? (
          <CommandEmpty>{emptyText}</CommandEmpty>
        ) : (
          (() => {
            let cursor = 0;
            return groups.map((group, gi) => {
              if (group.items.length === 0) return null;
              const start = cursor;
              cursor += group.items.length;
              return (
                <CommandGroup key={group.heading ?? `group-${String(gi)}`} heading={group.heading}>
                  {group.items.map((item, i) => {
                    const flatIndex = start + i;
                    const value = `i-${flatIndex}`;
                    return (
                      <CommandItem
                        key={item.key}
                        value={value}
                        disabled={item.disabled}
                        onSelect={() => onPick(flatIndex)}
                        className={cn('font-mono text-xs', itemClassName)}
                      >
                        {item.label}
                        {item.trailing}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            });
          })()
        )}
      </CommandList>
    </Command>
  );
}
