export type TopologyKind =
  | 'lights'
  | 'covers'
  | 'switches'
  | 'gates'
  | 'thermostats'
  | 'zones'
  | 'scenarios'
  | 'outputs'
  | 'system';

export interface TopologyNode {
  kind: TopologyKind;
  id: string;
  label?: string;
  state?: string;
  status: 'on' | 'off' | 'open' | 'closed' | 'armed' | 'disarmed' | 'bypassed' | 'alarm' | 'error' | 'unknown';
  raw: unknown;
}

export interface TopologyGroup {
  kind: TopologyKind;
  label: string;
  count: number;
  nodes: TopologyNode[];
}

export interface TopologySnapshot {
  groups: TopologyGroup[];
  total: number;
}

const GROUP_LABELS: Record<TopologyKind, string> = {
  lights: 'Lights',
  covers: 'Covers',
  switches: 'Switches',
  gates: 'Gates',
  thermostats: 'Thermostats',
  zones: 'Zones',
  scenarios: 'Scenarios',
  outputs: 'Outputs',
  system: 'System',
};

const KIND_ORDER: TopologyKind[] = [
  'zones',
  'lights',
  'covers',
  'outputs',
  'switches',
  'gates',
  'thermostats',
  'scenarios',
  'system',
];

function getProp<T = unknown>(obj: unknown, ...keys: string[]): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  for (const key of keys) {
    if (rec[key] !== undefined) return rec[key] as T;
  }
  return undefined;
}

function deriveStatus(kind: TopologyKind, state: string | undefined): TopologyNode['status'] {
  if (!state) return 'unknown';
  const s = state.toUpperCase();
  if (kind === 'zones') {
    if (s.includes('ALARM')) return 'alarm';
    if (s.includes('BYPASS')) return 'bypassed';
    if (s.includes('DISARM') || s.includes('IDLE') || s.includes('REST')) return 'disarmed';
    if (s.includes('ARM')) return 'armed';
  }
  if (kind === 'covers' || kind === 'gates') {
    if (s.includes('OPEN') || s.includes('UP')) return 'open';
    if (s.includes('CLOSE') || s.includes('DOWN') || s.includes('SHUT')) return 'closed';
  }
  if (kind === 'lights' || kind === 'outputs' || kind === 'switches') {
    if (s === 'ON' || s === 'TRUE' || s === '1') return 'on';
    if (s === 'OFF' || s === 'FALSE' || s === '0') return 'off';
    const n = Number(s);
    if (Number.isFinite(n)) return n > 0 ? 'on' : 'off';
  }
  if (s.includes('ERROR') || s.includes('FAULT')) return 'error';
  return 'unknown';
}

function normalizeKind(kind: TopologyKind, source: unknown): TopologyNode[] {
  if (source === undefined || source === null) return [];
  const items = Array.isArray(source) ? source : Object.values(source as Record<string, unknown>);
  const out: TopologyNode[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id = getProp<unknown>(item, 'ID', 'id', 'Id');
    if (id === undefined || id === null) continue;
    const label = getProp<string>(item, 'DES', 'NAME', 'name', 'label', 'description');
    const rawState = getProp<unknown>(item, 'STA', 'state', 'status');
    const state = rawState === undefined || rawState === null
      ? undefined
      : typeof rawState === 'string' ? rawState : String(rawState);
    out.push({
      kind,
      id: String(id),
      label: typeof label === 'string' ? label : undefined,
      state,
      status: deriveStatus(kind, state),
      raw: item,
    });
  }
  out.sort((a, b) => {
    const an = Number(a.id);
    const bn = Number(b.id);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.id.localeCompare(b.id);
  });
  return out;
}

export interface BuildTopologyInput {
  lights?: unknown;
  covers?: unknown;
  switches?: unknown;
  gates?: unknown;
  thermostats?: unknown;
  zones?: unknown;
  scenarios?: unknown;
  outputs?: unknown;
  system?: unknown;
}

export function buildTopology(input: BuildTopologyInput | undefined | null): TopologySnapshot {
  if (!input) return { groups: [], total: 0 };
  const sources: Record<TopologyKind, unknown> = {
    lights: input.lights,
    covers: input.covers,
    switches: input.switches,
    gates: input.gates,
    thermostats: input.thermostats,
    zones: input.zones,
    scenarios: input.scenarios,
    outputs: input.outputs,
    system: input.system,
  };
  const groups: TopologyGroup[] = [];
  let total = 0;
  for (const kind of KIND_ORDER) {
    const nodes = normalizeKind(kind, sources[kind]);
    if (nodes.length === 0) continue;
    groups.push({ kind, label: GROUP_LABELS[kind], count: nodes.length, nodes });
    total += nodes.length;
  }
  return { groups, total };
}
