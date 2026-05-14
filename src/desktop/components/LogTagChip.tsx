import type { LogTag } from '../../core/types.js';
import { cn } from '@/lib/utils';
import { getTagClasses } from '../runtime/log-tag-classes.js';

interface LogTagChipProps {
  tag: LogTag;
  className?: string;
}

export function LogTagChip({ tag, className }: LogTagChipProps) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 font-mono text-[0.7rem] font-semibold uppercase tracking-wide leading-tight text-center',
        getTagClasses(tag),
        className,
      )}
    >
      {tag}
    </span>
  );
}
