import { memo } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  Info,
  Layers,
  Pin,
  Star,
  Terminal,
} from 'lucide-react';
import { ProFeatureLock } from './ProFeatureLock';
import type { buildMessageListItems } from '../../core/log-view.js';
import { formatLogClock, getPrimaryTag } from '../../core/log-view.js';
import type { LogEntry, LogTag } from '../../core/types.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LogTagChip } from './LogTagChip.js';
import { RowChip } from './RowChip.js';
import { ackResultChipClasses } from '../runtime/status-chips.js';

export const ROW_ENTER_CAP = 30;

type IconComp = ComponentType<SVGProps<SVGSVGElement>>;

function getTagIcon(tag: LogTag): IconComp {
  switch (tag) {
    case 'RAW_RX': return ArrowDownLeft;
    case 'RAW_TX': return ArrowUpRight;
    case 'ACK':    return CornerDownLeft;
    case 'CHANGE': return Activity;
    case 'BULK':   return Layers;
    case 'ERROR':  return AlertTriangle;
    case 'LOG':    return Terminal;
    case 'SYSTEM': return Info;
    default:       return Info;
  }
}

export interface LogRowProps {
  item: ReturnType<typeof buildMessageListItems>[number];
  selected: boolean;
  bookmarked: boolean;
  pinned: boolean;
  rowIdPrefix: string;
  meta?: { highlight?: LogEntry['highlight'] };
  annotationsLicensed: boolean;
  searchTerms: string[];
  searchMatch?: boolean;
  animateEnter?: boolean;
  expanded?: boolean;
  onSelect: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onTogglePin: () => void;
  onToggleExpand?: (id: string) => void;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightFragment(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi');
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <mark
          key={i}
          className="rounded bg-[oklch(var(--accent)/0.35)] text-foreground px-0.5"
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

const HIGHLIGHT_BG: Record<NonNullable<LogEntry['highlight']>, string> = {
  red: 'bg-red-100/70 dark:bg-red-950/40 ring-1 ring-red-500/40',
  amber: 'bg-amber-100/70 dark:bg-amber-950/40 ring-1 ring-amber-500/40',
  emerald: 'bg-emerald-100/70 dark:bg-emerald-950/40 ring-1 ring-emerald-500/40',
  blue: 'bg-blue-100/70 dark:bg-blue-950/40 ring-1 ring-blue-500/40',
  violet: 'bg-violet-100/70 dark:bg-violet-950/40 ring-1 ring-violet-500/40',
};

function LogRowImpl({
  item, selected, bookmarked, pinned, rowIdPrefix, meta,
  annotationsLicensed,
  searchTerms, searchMatch, animateEnter,
  expanded, onToggleExpand,
  onSelect, onToggleBookmark, onTogglePin,
}: LogRowProps) {
  const { t } = useTranslation();
  const isError = item.tag === 'ERROR';
  const primaryTag: LogTag = getPrimaryTag(item);
  const isPairedWithWire = primaryTag === 'RAW_RX' && item.tag !== 'RAW_RX';
  const Icon = getTagIcon(primaryTag);
  const highlightCls = meta?.highlight ? HIGHLIGHT_BG[meta.highlight] : undefined;
  const hasSearch = searchTerms.length > 0;
  const isMatch = hasSearch && searchMatch === true;
  const isDimmed = hasSearch && searchMatch === false;
  const hasChildren = (item.children?.length ?? 0) > 0;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <>
    <motion.div
      id={`${rowIdPrefix}-${item.id}`}
      role="option"
      aria-selected={selected}
      initial={animateEnter ? { opacity: 0, y: 4 } : false}
      animate={animateEnter ? { opacity: 1, y: 0 } : undefined}
      transition={animateEnter ? { duration: 0.12, ease: [0.22, 1, 0.36, 1] } : undefined}
      className={cn(
        'hover:bg-muted/80 group relative grid min-h-9 w-full cursor-pointer items-center gap-x-3 rounded-lg border border-transparent pr-2 pl-3 py-1 text-left transition-[opacity,background-color,box-shadow]',
        'grid-cols-[1rem_minmax(4rem,max-content)_4.5rem_minmax(0,1fr)_auto_auto]',
        isError && !selected && 'bg-red-50/60 dark:bg-red-950/30',
        highlightCls && !selected && highlightCls,
        selected && 'shadow-sm',
        pinned && !selected && 'border-primary/40 ring-1 ring-primary/25',
        isMatch && !selected && 'ring-1 ring-[oklch(var(--accent)/0.55)] bg-[oklch(var(--accent)/0.06)]',
        isDimmed && 'opacity-45',
      )}
      style={selected
        ? {
            backgroundColor: 'var(--row-selected-bg)',
            boxShadow: 'inset 2px 0 0 0 var(--row-selected-bar)',
          }
        : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.currentTarget.parentElement?.focus();
        onSelect(item.id);
      }}
    >
      <Icon className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
      <LogTagChip tag={primaryTag} />
      <span className="text-muted-foreground font-mono text-meta tabular-nums opacity-70">
        {formatLogClock(item.ts)}
      </span>
      <span
        className="min-w-0 truncate text-row leading-snug flex items-center"
        style={{
          maskImage: 'linear-gradient(to right, black 92%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, black 92%, transparent)',
        }}
      >
        {hasChildren && onToggleExpand && (
          <button
            type="button"
            aria-label={expanded ? t('logs.collapseAria') : t('logs.expandAria')}
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground mr-1 shrink-0 rounded p-0.5"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand(item.id);
            }}
          >
            <Chevron className="size-3.5" aria-hidden />
          </button>
        )}
        <span className="min-w-0 truncate">
          {hasSearch ? highlightFragment(item.preview, searchTerms) : item.preview}
          {item.repeat !== undefined && item.repeat > 1 && (
            <span className="text-muted-foreground ml-1.5 font-mono text-meta tabular-nums">{t('logs.row.repeat', { n: item.repeat })}</span>
          )}
        </span>
      </span>
      <div className="flex shrink-0 items-center">
        {item.ack ? (
          <RowChip
            className={ackResultChipClasses(item.ack.result)}
            title={`${t('logs.row.ackTitlePrefix')} ${item.ack.result ?? ''}`.trim()}
          >
            <span className="font-semibold">{item.ack.result ?? t('logs.row.ackLabel')}</span>
          </RowChip>
        ) : isPairedWithWire ? (
          <LogTagChip
            tag={item.tag}
            title={t('logs.row.wireChipTitle')}
            aria-label={t('logs.row.wireChipAria')}
          />
        ) : null}
      </div>
      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100',
          selected || pinned || bookmarked
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100',
        )}
      >
        {annotationsLicensed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={pinned ? t('logs.row.unpinAria') : t('logs.row.pinAria')}
                  aria-pressed={pinned}
                  className={cn(
                    'rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted',
                    pinned && 'opacity-100 text-primary',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePin();
                  }}
                >
                  <Pin className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>{pinned ? t('logs.row.unpinTooltip') : t('logs.row.pinTooltip')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={bookmarked ? t('logs.row.unbookmarkAria') : t('logs.row.bookmarkAria')}
                  aria-pressed={bookmarked}
                  className={cn(
                    'rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted',
                    bookmarked && 'opacity-100 text-amber-500',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleBookmark(item.id);
                  }}
                >
                  <Star className={cn('size-3.5', bookmarked && 'fill-current')} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>{bookmarked ? t('logs.row.unbookmarkTooltip') : t('logs.row.bookmarkTooltip')}</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <ProFeatureLock
            featureId="annotations"
            label={t('logs.row.annotationsLockLabel')}
            variant="icon"
            tooltip={t('logs.row.annotationsLockTooltip')}
            className="size-7"
          />
        )}
      </div>
    </motion.div>
    {hasChildren && expanded && (
      <div role="presentation" className="text-muted-foreground border-border/40 ml-[7.5rem] mt-0.5 mb-1 flex flex-col gap-0.5 border-l py-1 pl-3 font-mono text-row leading-snug">
        {item.children!.map((child) => (
          <div key={child.key} className="truncate">{child.line}</div>
        ))}
      </div>
    )}
    </>
  );
}

export const LogRow = memo(LogRowImpl);
