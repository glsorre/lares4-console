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

function prettyLines(value: unknown, depth: number): string[] {
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
  if (mode === 'json') return safeJson(value);
  return prettyLines(value, 0).join('\n');
}

export function shouldPrint(filters: Set<EventFilter>, type: EventFilter): boolean {
  if (filters.has('none')) {
    return false;
  }
  return filters.has('all') || filters.has(type);
}
