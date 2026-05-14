import { useEffect, useMemo, useState } from 'react';
import { Activity, Lightbulb, Blinds, ToggleLeft, DoorClosed, Thermometer, ShieldAlert, Zap, Cable, Cpu } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { topKeyAndId } from '../../core/log-view.js';
import type { LogEntry } from '../../core/types.js';
import type { TopologyKind, TopologyNode, TopologySnapshot } from '../../core/topology.js';

const KIND_FROM_TOP_KEY: Record<string, TopologyKind> = {
  LIGHT: 'lights',
  LIGHTS: 'lights',
  COVER: 'covers',
  COVERS: 'covers',
  SWITCH: 'switches',
  SWITCHES: 'switches',
  GATE: 'gates',
  GATES: 'gates',
  THERMOSTAT: 'thermostats',
  THERMOSTATS: 'thermostats',
  ZONE: 'zones',
  ZONES: 'zones',
  SCENARIO: 'scenarios',
  SCENARIOS: 'scenarios',
  OUTPUT: 'outputs',
  OUTPUTS: 'outputs',
  SYSTEM: 'system',
};

const KIND_ICON: Record<TopologyKind, typeof Activity> = {
  lights: Lightbulb,
  covers: Blinds,
  switches: ToggleLeft,
  gates: DoorClosed,
  thermostats: Thermometer,
  zones: ShieldAlert,
  scenarios: Zap,
  outputs: Cable,
  system: Cpu,
};

interface ActivityRow {
  key: string;
  ts: number;
  kind: TopologyKind;
  id: string;
  label?: string;
  delta: string;
  latencyMs?: number;
  status: TopologyNode['status'];
  level: LogEntry['level'];
}

function extractActivity(
  entry: LogEntry,
  idToNode: ReadonlyMap<string, TopologyNode>,
): { kind: TopologyKind; id: string; label?: string; delta: string; status: TopologyNode['status'] } | undefined {
  if (entry.tag !== 'CHANGE' && entry.tag !== 'ACK') return undefined;
  if (!entry.payload || typeof entry.payload !== 'object' || Array.isArray(entry.payload)) return undefined;
  const top = topKeyAndId(entry.payload as Record<string, unknown>);
  if (!top || top.id === undefined) return undefined;
  const kind = KIND_FROM_TOP_KEY[top.key.toUpperCase()];
  if (!kind) return undefined;
  const node = idToNode.get(`${kind}:${top.id}`);
  const delta = top.idPart
    ? top.idPart.replace(/^\[\d+\]\s*/, '')
    : entry.message.replace(/^→\s*/, '');
  return {
    kind,
    id: top.id,
    label: node?.label,
    delta: delta || node?.state || node?.status || 'change',
    status: node?.status ?? 'unknown',
  };
}

function formatDelta(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 1) return 'now';
  if (secs < 60) return `−${secs}s`;
  const mins = Math.round(secs / 60);
  return `−${mins}m`;
}

interface RecentActivityPaneProps {
  entries: LogEntry[];
  topology: TopologySnapshot;
  onFilterById: (id: string) => void;
  windowMs?: number;
  className?: string;
}

const DEFAULT_WINDOW_MS = 30_000;
const DEDUPE_MS = 250;

export function RecentActivityPane({
  entries,
  topology,
  onFilterById,
  windowMs = DEFAULT_WINDOW_MS,
  className,
}: RecentActivityPaneProps) {
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const idToNode = useMemo(() => {
    const m = new Map<string, TopologyNode>();
    for (const group of topology.groups) {
      for (const node of group.nodes) m.set(`${node.kind}:${node.id}`, node);
    }
    return m;
  }, [topology]);

  const rows = useMemo<ActivityRow[]>(() => {
    const cutoff = now - windowMs;
    const out: ActivityRow[] = [];
    let lastSig = '';
    let lastTs = 0;
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      const ts = Date.parse(entry.ts);
      if (!Number.isFinite(ts) || ts < cutoff) break;
      const info = extractActivity(entry, idToNode);
      if (!info) continue;
      const sig = `${info.kind}:${info.id}:${info.delta}`;
      if (sig === lastSig && Math.abs(ts - lastTs) < DEDUPE_MS) continue;
      lastSig = sig;
      lastTs = ts;
      out.push({
        key: `${entry.ts}-${entry.tag}-${info.kind}-${info.id}-${out.length}`,
        ts,
        kind: info.kind,
        id: info.id,
        label: info.label,
        delta: info.delta,
        latencyMs: entry.latencyMs,
        status: info.status,
        level: entry.level,
      });
      if (out.length >= 24) break;
    }
    return out;
  }, [entries, idToNode, now, windowMs]);

  const livePulse = rows.length > 0 && now - rows[0].ts < 1500 && !reduceMotion;

  return (
    <section
      aria-label="Recent device activity"
      className={cn(
        'border-border/60 bg-pane/30 flex shrink-0 flex-col gap-1 border-b px-3 py-2',
        className,
      )}
    >
      <header className="text-muted-foreground flex items-center gap-2 px-1 pb-1 text-[0.65rem] font-semibold tracking-[0.08em] uppercase">
        <Activity className="size-3.5" aria-hidden />
        <span
          className={cn(
            'inline-block size-[6px] rounded-full',
            livePulse ? 'animate-pulse bg-[oklch(0.55_0.12_138)]' : 'bg-muted-foreground/40',
          )}
          aria-hidden
        />
        <span>Recent activity</span>
        <span
          className="text-muted-foreground/80 ml-auto font-mono text-xs tracking-normal normal-case"
          aria-live="polite"
        >
          last {Math.round(windowMs / 1000)}s · {rows.length}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="text-muted-foreground/70 px-1 py-2 text-[11px]">
          Waiting for device events…
        </p>
      ) : (
        <ul role="list" className="flex flex-col">
          {rows.map((row) => {
            const Icon = KIND_ICON[row.kind] ?? Activity;
            return (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => onFilterById(row.id)}
                  className="hover:bg-accent/40 grid w-full grid-cols-[34px_14px_38px_1fr_auto] items-center gap-2 rounded-md px-1.5 py-1 text-left"
                  title={`Filter log to id:${row.id}`}
                >
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {formatDelta(now - row.ts)}
                  </span>
                  <span
                    className={cn('text-muted-foreground flex items-center', row.level === 'error' && 'text-destructive')}
                    aria-hidden
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {row.id}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[11.5px]">
                      {row.label ?? <span className="italic">id {row.id}</span>}
                    </span>
                    <span
                      className={cn(
                        'text-muted-foreground truncate font-mono text-xs',
                        row.level === 'error' && 'text-destructive/80',
                      )}
                    >
                      {row.delta}
                    </span>
                  </span>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {row.latencyMs !== undefined ? `${row.latencyMs}ms` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function collectRecentDeviceIds(
  entries: LogEntry[],
  topology: TopologySnapshot,
  windowMs: number = DEFAULT_WINDOW_MS,
  nowMs: number = Date.now(),
): Set<string> {
  const idToNode = new Map<string, TopologyNode>();
  for (const group of topology.groups) {
    for (const node of group.nodes) idToNode.set(`${node.kind}:${node.id}`, node);
  }
  const cutoff = nowMs - windowMs;
  const ids = new Set<string>();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    const ts = Date.parse(entry.ts);
    if (!Number.isFinite(ts) || ts < cutoff) break;
    const info = extractActivity(entry, idToNode);
    if (info) ids.add(info.id);
  }
  return ids;
}
