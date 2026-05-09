import type { EventFilter } from './types.js';

export function nowIso(): string {
  return new Date().toISOString();
}

export function redactSecrets(value: string): string {
  let out = value;
  out = out.replace(/("PIN"\s*:\s*)("[^"]*"|[^",}\s]+)/gi, '$1"***"');
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

export function shouldPrint(filters: Set<EventFilter>, type: EventFilter): boolean {
  if (filters.has('none')) {
    return false;
  }
  return filters.has('all') || filters.has(type);
}
