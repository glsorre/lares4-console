import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Network, PanelRightClose, Play, Search } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { statusColorVar } from '../runtime/topology-status-color.js';
import type { TopologyNode, TopologySnapshot } from '../../core/topology.js';

type TopologyVariant = 'panel' | 'rail' | 'compact';

interface TopologyPaneProps {
  topology: TopologySnapshot;
  onFilterById: (id: string) => void;
  variant?: TopologyVariant;
  onClose?: () => void;
  onRunStateAll?: () => void;
  canRunStateAll?: boolean;
  recentDeviceIds?: ReadonlySet<string>;
  filter?: string;
  onFilterChange?: (next: string) => void;
}

const STATUS_STYLE: Record<TopologyNode['status'], string> = {
  on: 'bg-[oklch(var(--accent)/0.18)] text-foreground ring-[oklch(var(--accent)/0.40)]',
  off: 'bg-muted text-muted-foreground ring-border/50',
  open: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30',
  closed: 'bg-muted text-muted-foreground ring-border/50',
  armed: 'bg-[oklch(var(--accent)/0.18)] text-foreground ring-[oklch(var(--accent)/0.40)]',
  disarmed: 'bg-muted text-muted-foreground ring-border/50',
  bypassed: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/30',
  alarm: 'bg-red-500/20 text-red-700 dark:text-red-300 ring-red-500/40',
  error: 'bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/30',
  unknown: 'bg-muted text-muted-foreground ring-border/50',
};

export function TopologyPane({
  topology,
  onFilterById,
  variant = 'panel',
  onClose,
  onRunStateAll,
  canRunStateAll = false,
  recentDeviceIds,
  filter: filterProp,
  onFilterChange,
}: TopologyPaneProps) {
  const { t } = useTranslation();
  const isControlled = filterProp !== undefined && onFilterChange !== undefined;
  const [internalFilter, setInternalFilter] = useState('');
  const filter = isControlled ? filterProp! : internalFilter;
  const setFilter = isControlled ? onFilterChange! : setInternalFilter;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!filter.trim()) return topology;
    const term = filter.toLowerCase();
    const groups = topology.groups
      .map((g) => ({
        ...g,
        nodes: g.nodes.filter((n) =>
          n.id.toLowerCase().includes(term)
          || n.label?.toLowerCase().includes(term)
          || n.state?.toLowerCase().includes(term)
        ),
      }))
      .filter((g) => g.nodes.length > 0);
    return { groups, total: groups.reduce((sum, g) => sum + g.nodes.length, 0) };
  }, [topology, filter]);

  function toggle(kind: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const isRail = variant === 'rail';
  const isCompact = variant === 'compact';

  const empty = topology.total === 0;

  const showCloseButton = isRail && onClose;
  const showFilterInput = !empty && !isCompact;
  const headerSlot = (
    <div className={cn(
      'flex shrink-0 flex-col gap-1.5 border-b border-border/60',
      isCompact ? 'px-3 py-1.5' : 'px-4 py-1.5',
    )}>
      <div className={cn('flex items-center gap-2', isCompact ? 'min-h-[26px]' : 'min-h-[34px]')}>
        <Network className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <span className={cn('shrink-0 font-medium', isCompact ? 'text-xs' : 'text-sm')}>{t('topology.header')}</span>
        {!empty && (
          <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums shrink-0">
            {filtered.total}{filtered.total !== topology.total ? `/${topology.total}` : ''}
          </span>
        )}
        {showCloseButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground ml-auto h-7 w-7 p-0"
                onClick={onClose}
                aria-label={t('topology.hideAria')}
              >
                <PanelRightClose className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('topology.hideTooltip')}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {showFilterInput && (
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search className="text-muted-foreground pointer-events-none absolute left-2 size-3.5" aria-hidden />
          <Input
            type="search"
            placeholder={t('topology.filterPlaceholder')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            spellCheck={false}
            className="h-7 pl-7 font-mono text-xs"
            aria-label={t('topology.filterAria')}
          />
        </div>
      )}
    </div>
  );

  const emptyBody = (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="bg-muted/50 text-muted-foreground/50 flex size-9 items-center justify-center rounded-full">
        <Network className="size-4" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-foreground/75 text-sm font-medium">{t('topology.emptyTitle')}</p>
        <p className="text-muted-foreground max-w-[16rem] text-xs leading-relaxed">
          <Trans i18nKey="topology.emptyBody" components={{ mono: <span className="font-mono" /> }} />
        </p>
      </div>
      {canRunStateAll && onRunStateAll && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRunStateAll}
          className="h-7 gap-1.5 text-xs"
        >
          <Play className="size-3.5" aria-hidden />
          {t('topology.runStateAllPrefix')} <span className="font-mono">{t('topology.runStateAllCmd')}</span>
        </Button>
      )}
    </div>
  );

  const listBody = (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-2 px-3 py-3">
        {filtered.groups.map((group) => {
          const isCollapsed = collapsed.has(group.kind);
          return (
            <div key={group.kind} className="border-border/50 rounded-lg border bg-background/40">
              <button
                type="button"
                className="hover:bg-muted/60 flex w-full items-center justify-between gap-2 rounded-t-lg px-3 py-2 text-left"
                onClick={() => toggle(group.kind)}
                aria-expanded={!isCollapsed}
              >
                <span className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
                  <span className="text-sm font-medium">{group.label}</span>
                </span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">{group.count}</span>
              </button>
              {!isCollapsed && (
                <ul className="divide-border/40 border-border/40 divide-y border-t" role="list">
                  {group.nodes.map((node) => (
                    <li key={`${group.kind}-${node.id}`}>
                      <button
                        type="button"
                        className="hover:bg-muted/60 flex w-full items-center gap-2 px-3 py-1.5 text-left"
                        onClick={() => onFilterById(node.id)}
                        title={t('topology.filterByIdTitle', { id: node.id })}
                      >
                        <span className="text-muted-foreground w-10 shrink-0 font-mono text-xs tabular-nums">
                          {node.id}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {node.label ?? <span className="text-muted-foreground italic">{t('topology.idFallback', { id: node.id })}</span>}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded px-1.5 py-0.5 font-mono text-xs uppercase ring-1',
                            STATUS_STYLE[node.status],
                          )}
                          title={node.state ?? t('topology.statusUnknown')}
                        >
                          {node.state ?? node.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );

  const compactListBody = (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-0.5 px-2 py-2">
        {filtered.groups.map((group) => {
          const isCollapsed = collapsed.has(group.kind);
          return (
            <div key={group.kind} className="flex flex-col">
              <button
                type="button"
                className="bg-pane/85 text-muted-foreground hover:bg-accent/40 sticky top-0 z-10 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-semibold tracking-[0.08em] uppercase backdrop-blur"
                onClick={() => toggle(group.kind)}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? <ChevronRight className="size-3" aria-hidden /> : <ChevronDown className="size-3" aria-hidden />}
                <span>{group.label}</span>
                <span className="text-muted-foreground/80 ml-auto font-mono text-xs tracking-normal normal-case tabular-nums">{group.count}</span>
              </button>
              {!isCollapsed && (
                <ul className="flex flex-col" role="list">
                  {group.nodes.map((node) => {
                    const recent = recentDeviceIds?.has(node.id) ?? false;
                    return (
                      <li key={`${group.kind}-${node.id}`}>
                        <button
                          type="button"
                          className={cn(
                            'hover:bg-accent/40 grid w-full grid-cols-[38px_1fr_auto_10px] items-center gap-2 rounded-md px-1.5 py-1 text-left',
                          )}
                          style={recent ? { boxShadow: 'inset 2px 0 0 var(--primary)' } : undefined}
                          onClick={() => onFilterById(node.id)}
                          title={t('topology.filterByIdTitle', { id: node.id })}
                        >
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            {node.id}
                          </span>
                          <span className="min-w-0 truncate text-[13px]">
                            {node.label ?? <span className="text-muted-foreground italic">{t('topology.idFallback', { id: node.id })}</span>}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs tracking-normal">
                            {node.state ?? ''}
                          </span>
                          <span
                            className="inline-block size-2 rounded-full"
                            style={{ background: statusColorVar(node.status) }}
                            title={node.state ?? node.status}
                            aria-label={node.status}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );

  if (isCompact) {
    return (
      <div className="bg-pane/30 border-border/60 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {headerSlot}
        <div className="flex min-h-0 flex-1 flex-col">{empty ? emptyBody : compactListBody}</div>
      </div>
    );
  }

  if (isRail) {
    return (
      <div className="bg-pane/30 border-border/60 flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l">
        {headerSlot}
        <div className="flex min-h-0 flex-1 flex-col">{empty ? emptyBody : listBody}</div>
      </div>
    );
  }

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      {headerSlot}
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
        {empty ? emptyBody : listBody}
      </CardContent>
    </Card>
  );
}
