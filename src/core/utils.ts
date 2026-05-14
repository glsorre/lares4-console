import type { EventFilter, OutputFormat } from './types.js';

export function nowIso(): string {
  return new Date().toISOString();
}

export function redactSecrets(value: string): string {
  let out = value;
  out = out.replace(/("PIN"\s*:\s*)("[^"]*"|[^",}\s]+)/gi, '$1"***"');
  out = out.replace(/\bpin\s*=\s*([^\s,]+)/gi, 'pin=***');
  out = out.replace(/\bpin:\s*([^\s,]+)/gi, 'pin:***');
  out = out.replace(/("ID_LOGIN"\s*:\s*)("[^"]*"|[^",}\s]+)/gi, '$1"***"');
  out = out.replace(/("TOKEN"\s*:\s*)("[^"]*"|[^",}\s]+)/gi, '$1"***"');
  return out;
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const PLACEHOLDER_ERROR_RE = /^\[object [A-Za-z]+\]$/;

export function isPlaceholderErrorMessage(s: string): boolean {
  return PLACEHOLDER_ERROR_RE.test(s.trim());
}

export function formatUnknownError(value: unknown): string {
  if (value == null) return 'Unknown error';
  if (typeof value === 'string') return value.length > 0 ? value : 'Unknown error';
  if (value instanceof Error) return value.message || value.name || 'Unknown error';
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.code === 'number' && 'reason' in v) {
      const reason = typeof v.reason === 'string' && v.reason.length > 0 ? `: ${v.reason}` : '';
      const clean = v.wasClean === false ? ' (unclean)' : '';
      return `WebSocket closed (code ${String(v.code)})${reason}${clean}`;
    }
    const message = typeof v.message === 'string' && v.message.length > 0 ? v.message : undefined;
    const type = typeof v.type === 'string' ? v.type : undefined;
    const target = v.target as { url?: unknown } | undefined;
    const url = target && typeof target.url === 'string' ? target.url : undefined;
    if (message) return url ? `${message} (${url})` : message;
    if (type) return url ? `WebSocket ${type} (${url})` : `WebSocket ${type}`;
    try {
      const json = JSON.stringify(value);
      if (json && json !== '{}') return json;
    } catch { /* fall through */ }
    return 'Unknown error';
  }
  return String(value);
}

export function prettyLines(value: unknown, depth: number): string[] {
  const pad = '  '.repeat(depth);
  const childPad = '  '.repeat(depth + 1);
  if (value === null) return [`${pad}null`];
  if (value === undefined) return [`${pad}undefined`];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [`${pad}${String(value)}`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}[]`];
    const lines: string[] = [];
    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        lines.push(`${pad}-`);
        lines.push(...prettyLines(item, depth + 1));
      } else {
        lines.push(`${pad}- ${String(item)}`);
      }
    }
    return lines;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [`${pad}{}`];
    const lines: string[] = [];
    for (const [key, child] of entries) {
      if (child !== null && typeof child === 'object') {
        lines.push(`${pad}${key}:`);
        lines.push(...prettyLines(child, depth + 1));
      } else {
        lines.push(`${pad}${key}: ${String(child)}`);
      }
    }
    return lines;
  }
  return [`${childPad}${String(value)}`];
}

export function formatOutput(value: unknown, mode: OutputFormat): string {
  if (mode === 'pretty') return prettyLines(value, 0).join('\n');
  return safeJson(value);
}

export function shouldPrint(filters: Set<EventFilter>, type: EventFilter): boolean {
  if (filters.has('none')) {
    return false;
  }
  return filters.has('all') || filters.has(type);
}
