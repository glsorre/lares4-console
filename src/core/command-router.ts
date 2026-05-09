import type { EventFilter, OutputFormat } from './types.js';
import { parseCommandTokens, parseNumber } from './parsers.js';
import { safeJson } from './utils.js';
import { canonicalStateScope } from './state-scope.js';
import { COMMAND_HELP_LINES, EVENT_FILTERS, ROOT_COMMANDS, STATE_SCOPES } from './command-spec.js';

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function nearestCommand(input: string): string | undefined {
  if (!input) return undefined;
  let best: string | undefined;
  let score = Number.POSITIVE_INFINITY;
  for (const candidate of ROOT_COMMANDS) {
    const distance = editDistance(input, candidate);
    if (distance < score) {
      score = distance;
      best = candidate;
    }
  }
  return score <= 3 ? best : undefined;
}

function unsupported(command: string, usage: string): never {
  const suggestion = nearestCommand(command);
  const hint = suggestion ? ` Did you mean "${suggestion}"?` : '';
  throw new Error(`Unsupported command usage for "${command}". Usage: ${usage}.${hint} Run "help" for examples.`);
}

export interface CommandContext {
  lares: {
    switchOn: (id: number) => void;
    switchOff: (id: number) => void;
    dimmerTo: (id: number, level: number) => void;
    rollUp: (id: number) => void;
    rollDown: (id: number) => void;
    rollStop: (id: number) => void;
    rollTo: (id: number, pos: number) => void;
    triggerScenario: (id: number) => void;
  };
  socketSend: (cmd: string, payloadType: string, payload: Record<string, unknown>) => void;
  outputFormat: OutputFormat;
  eventFilters: Set<EventFilter>;
  onEventFiltersChanged: (next: Set<EventFilter>) => void;
  onFormatChanged: (fmt: OutputFormat) => void;
  rawFullEnabled: boolean;
  onRawFullChanged: (enabled: boolean) => void;
  onExport: (path?: string) => Promise<string>;
  getStateSnapshot: (scope: string) => unknown;
}

export async function executeCommand(line: string, ctx: CommandContext): Promise<string[]> {
  const trimmedLine = line.trim();
  const args = parseCommandTokens(trimmedLine);
  const [head, sub, third] = args;
  if (!head) {
    return [];
  }
  if (head === 'help') {
    return [...COMMAND_HELP_LINES];
  }
  if (head === 'format') {
    if (sub !== 'pretty' && sub !== 'json') {
      unsupported('format', 'format pretty|json');
    }
    ctx.onFormatChanged(sub);
    return [`Output format set to: ${sub}`];
  }
  if (head === 'events') {
    if (!sub) {
      unsupported('events', `events none|all|${EVENT_FILTERS.join(',')}`);
    }
    const parsed = sub.split(',').map((v) => v.trim()).filter(Boolean);
    const invalid = parsed.filter((v) => !EVENT_FILTERS.includes(v as (typeof EVENT_FILTERS)[number]));
    if (sub !== 'all' && sub !== 'none' && invalid.length > 0) {
      unsupported('events', `events none|all|${EVENT_FILTERS.join(',')}`);
    }
    const next = sub === 'all'
      ? new Set<EventFilter>(['all'])
      : sub === 'none'
        ? new Set<EventFilter>(['none'])
        : new Set(parsed as EventFilter[]);
    ctx.onEventFiltersChanged(next);
    return [`Event filters set to: ${Array.from(next).join(',')}`];
  }
  if (head === 'raw' && sub === 'full') {
    if (third !== 'on' && third !== 'off') {
      unsupported('raw', 'raw full on|off');
    }
    const enabled = third === 'on';
    ctx.onRawFullChanged(enabled);
    return [`Raw full mode set to: ${enabled ? 'on' : 'off'}`];
  }
  if (head === 'raw' && sub === 'send') {
    const matched = trimmedLine.match(/^raw\s+send\s+(\S+)\s+(\S+)\s+([\s\S]+)$/);
    const cmd = matched?.[1];
    const payloadType = matched?.[2];
    const payloadRaw = matched?.[3];
    if (!cmd || !payloadType || !payloadRaw) {
      unsupported('raw', 'raw send <CMD> <PAYLOAD_TYPE> <JSON_PAYLOAD>');
    }
    let payload: Record<string, unknown>;
    const normalizedPayloadRaw = (() => {
      const trimmed = payloadRaw.trim();
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    })();
    try {
      payload = JSON.parse(normalizedPayloadRaw) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid JSON payload for raw send. Usage: raw send <CMD> <PAYLOAD_TYPE> <JSON_PAYLOAD>');
    }
    ctx.socketSend(cmd, payloadType, payload);
    return [`raw send ${cmd} ${payloadType} ${safeJson(payload)}`];
  }
  if (head === 'raw' && sub === 'sendcmd') {
    const rawJson = trimmedLine.replace(/^raw\s+sendcmd\s+/, '');
    if (!rawJson || rawJson === trimmedLine) {
      unsupported('raw', 'raw sendcmd <JSON_COMMAND>');
    }
    let parsed: {
      CMD?: string;
      PAYLOAD_TYPE?: string;
      PAYLOAD?: Record<string, unknown>;
    };
    try {
      parsed = JSON.parse(rawJson) as {
        CMD?: string;
        PAYLOAD_TYPE?: string;
        PAYLOAD?: Record<string, unknown>;
      };
    } catch {
      throw new Error('Invalid JSON payload for raw sendcmd. Usage: raw sendcmd <JSON_COMMAND>');
    }
    if (!parsed.CMD || !parsed.PAYLOAD_TYPE || typeof parsed.PAYLOAD !== 'object' || parsed.PAYLOAD === null) {
      unsupported('raw', 'raw sendcmd <JSON_COMMAND>');
    }
    ctx.socketSend(parsed.CMD, parsed.PAYLOAD_TYPE, parsed.PAYLOAD);
    return [`raw sendcmd ${parsed.CMD} ${parsed.PAYLOAD_TYPE}`];
  }
  if (head === 'state') {
    const scope = canonicalStateScope(sub ?? 'all');
    if (!STATE_SCOPES.includes(scope as (typeof STATE_SCOPES)[number])) {
      unsupported('state', `state ${STATE_SCOPES.join('|')}`);
    }
    const snapshot = ctx.getStateSnapshot(scope);
    if (snapshot === undefined) {
      return [`No data available for state scope: ${scope}`];
    }
    return [safeJson(snapshot)];
  }
  if (head === 'lights') {
    if (sub !== 'on' && sub !== 'off' && sub !== 'dim') {
      unsupported('lights', 'lights on|off|dim <id> [level]');
    }
    const id = parseNumber(third, 'id', { min: 0, integer: true });
    if (sub === 'on') ctx.lares.switchOn(id);
    else if (sub === 'off') ctx.lares.switchOff(id);
    else ctx.lares.dimmerTo(id, parseNumber(args[3], 'level', { min: 0, max: 100, integer: true }));
    return [`ok lights ${sub} id=${id}`];
  }
  if (head === 'covers') {
    if (sub !== 'up' && sub !== 'down' && sub !== 'stop' && sub !== 'to') {
      unsupported('covers', 'covers up|down|stop|to <id> [position]');
    }
    const id = parseNumber(third, 'id', { min: 0, integer: true });
    if (sub === 'up') ctx.lares.rollUp(id);
    else if (sub === 'down') ctx.lares.rollDown(id);
    else if (sub === 'stop') ctx.lares.rollStop(id);
    else ctx.lares.rollTo(id, parseNumber(args[3], 'position', { min: 0, max: 100, integer: true }));
    return [`ok covers ${sub} id=${id}`];
  }
  if (head === 'scenario') {
    if (sub !== 'trigger') {
      unsupported('scenario', 'scenario trigger <id>');
    }
    const id = parseNumber(third, 'id', { min: 0, integer: true });
    ctx.lares.triggerScenario(id);
    return [`ok scenario trigger id=${id}`];
  }
  if (head === 'raw') {
    unsupported('raw', 'raw send <CMD> <PAYLOAD_TYPE> <JSON_PAYLOAD> | raw sendcmd <JSON_COMMAND> | raw full on|off');
  }
  if (head === 'export') {
    const path = args[1];
    const output = await ctx.onExport(path);
    return [`Session exported to: ${output}`];
  }
  if (head === 'exit' || head === 'quit') {
    return ['__EXIT__'];
  }
  unsupported(head, 'help');
}
