import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const ROW_CHIP_BASE =
  'shrink-0 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-wide leading-tight tabular-nums';

export function RowChip({ className, ...rest }: ComponentProps<'span'>) {
  return <span {...rest} className={cn(ROW_CHIP_BASE, className)} />;
}
