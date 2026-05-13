import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Network, PanelRightClose, Play, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { TopologyNode, TopologySnapshot } from '../../core/topology.js';

type TopologyVariant = 'panel' | 'rail';

interface TopologyPaneProps {
  topology: TopologySnapshot;
  onFilterById: (id: string) => void;
  variant?: TopologyVariant;
  onClose?: () => void;
  onRunStateAll?: () => void;
  canRunStateAll?: boolean;
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
}: TopologyPaneProps) {
  const [filter, setFilter] = useState('');
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

  const empty = topology.total === 0;

  const headerSlot = (
    <div className={cn(
      'flex shrink-0 flex-col gap-1.5 px-4 py-1.5',
      isRail ? 'border-b border-border/60' : 'border-b border-border/60',
    )}>
      <div className="flex min-h-[34px] items-center gap-2">
        <Network className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <span className="text-sm font-medium shrink-0">Devices</span>
        {!empty && (
          <span className="text-muted-foreground font-mono text-xs tabular-nums shrink-0">
            {filtered.total}{filtered.total !== topology.total ? `/${topology.total}` : ''}
          </span>
        )}
        {isRail && onClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground ml-auto h-7 w-7 p-0"
                onClick={onClose}
                aria-label="Hide devices rail"
              >
                <PanelRightClose className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hide rail</TooltipContent>
          </Tooltip>
        )}
      </div>
      {!empty && (
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search className="text-muted-foreground pointer-events-none absolute left-2 size-3.5" aria-hidden />
          <Input
            type="search"
            placeholder="Filter id, label, state"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            spellCheck={false}
            className="h-7 pl-7 font-mono text-xs"
            aria-label="Filter topology"
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
        <p className="text-foreground/75 text-sm font-medium">No devices yet</p>
        <p className="text-muted-foreground max-w-[16rem] text-xs leading-relaxed">
          Connect to a panel or run <span className="font-mono">state all</span> to populate the topology.
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
          Run <span className="font-mono">state all</span>
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
                        title={`Filter log to id:${node.id}`}
                      >
                        <span className="text-muted-foreground w-10 shrink-0 font-mono text-[0.7rem] tabular-nums">
                          {node.id}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {node.label ?? <span className="text-muted-foreground italic">id {node.id}</span>}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded px-1.5 py-0.5 font-mono text-[0.65rem] uppercase ring-1',
                            STATUS_STYLE[node.status],
                          )}
                          title={node.state ?? 'unknown'}
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
