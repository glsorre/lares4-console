import { entrySource } from './types.js';
import type { LogEntry, LogLevel, LogSource, LogTag } from './types.js';

export interface LogPredicate {
  (entry: LogEntry): boolean;
}

export interface CompiledQuery {
  predicate: LogPredicate;
  isEmpty: boolean;
  freeTextTerms: string[];
  error?: string;
}

export const TAG_VALUES: readonly LogTag[] = ['ACK', 'RAW_RX', 'RAW_TX', 'BULK', 'CHANGE', 'ERROR', 'LOG', 'SYSTEM'];
const TAG_SET: ReadonlySet<string> = new Set(TAG_VALUES);
export const LEVEL_VALUES: readonly LogLevel[] = ['info', 'warn', 'error', 'debug'];
const LEVEL_SET: ReadonlySet<string> = new Set(LEVEL_VALUES);
export const SOURCE_VALUES: readonly LogSource[] = ['command', 'lifecycle', 'wire'];
const SOURCE_SET: ReadonlySet<string> = new Set(SOURCE_VALUES);

function tokenize(input: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote: '"' | "'" | undefined;
  let inRegex = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] as string;
    if (quote) {
      if (ch === quote) { quote = undefined; buf += ch; continue; }
      buf += ch;
      continue;
    }
    if (inRegex) {
      buf += ch;
      if (ch === '/' && input[i - 1] !== '\\') inRegex = false;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '/' && (buf === '' || buf.endsWith(':') || buf.endsWith('~') || buf.endsWith('='))) {
      inRegex = true;
      buf += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (buf.length > 0) { out.push(buf); buf = ''; }
      continue;
    }
    buf += ch;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return s.slice(1, -1);
  }
  return s;
}

function parseRegex(value: string): RegExp | undefined {
  if (value.length < 2 || value[0] !== '/') return undefined;
  const lastSlash = value.lastIndexOf('/');
  if (lastSlash <= 0) return undefined;
  const body = value.slice(1, lastSlash);
  const flags = value.slice(lastSlash + 1);
  try { return new RegExp(body, flags || 'i'); } catch { return undefined; }
}

function parseClockMs(value: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  return ((h * 3600) + (min * 60) + s) * 1000;
}

function entryClockMs(entry: LogEntry): number | undefined {
  const t = Date.parse(entry.ts);
  if (Number.isNaN(t)) return undefined;
  const d = new Date(t);
  return ((d.getHours() * 3600) + (d.getMinutes() * 60) + d.getSeconds()) * 1000;
}

function getByPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === undefined || cur === null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(key);
      if (Number.isInteger(idx)) { cur = cur[idx]; continue; }
      // search elements for key match
      const matches: unknown[] = [];
      for (const item of cur) {
        if (item && typeof item === 'object') {
          const v = (item as Record<string, unknown>)[key];
          if (v !== undefined) matches.push(v);
        }
      }
      if (matches.length === 0) return undefined;
      cur = matches.length === 1 ? matches[0] : matches;
      continue;
    }
    if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[key];
      continue;
    }
    return undefined;
  }
  return cur;
}

function findDeepValueByKey(obj: unknown, key: string): unknown[] {
  const out: unknown[] = [];
  const stack: unknown[] = [obj];
  const targetLower = key.toLowerCase();
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (k.toLowerCase() === targetLower) out.push(v);
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return out;
}

function valueMatches(actual: unknown, op: '=' | '~', expected: string): boolean {
  const re = parseRegex(expected);
  if (op === '~' && re) {
    return matchAny(actual, (s) => re.test(s));
  }
  const target = stripQuotes(expected);
  if (op === '=') return matchAny(actual, (s) => s === target);
  return matchAny(actual, (s) => s.toLowerCase().includes(target.toLowerCase()));
}

function matchAny(actual: unknown, pred: (s: string) => boolean): boolean {
  if (actual === undefined || actual === null) return false;
  if (Array.isArray(actual)) return actual.some((v) => matchAny(v, pred));
  if (typeof actual === 'object') return pred(JSON.stringify(actual));
  return pred(String(actual));
}

interface TokenPredicate {
  predicate: LogPredicate;
  freeText?: string;
}

function compileToken(token: string): TokenPredicate | { error: string } {
  // ts>HH:MM:SS or ts<HH:MM:SS or ts=HH:MM:SS
  const tsMatch = /^ts([<>=])(.+)$/.exec(token);
  if (tsMatch) {
    const op = tsMatch[1];
    const target = parseClockMs(tsMatch[2]);
    if (target === undefined) return { error: `Invalid ts value: ${tsMatch[2]}` };
    return {
      predicate: (entry) => {
        const v = entryClockMs(entry);
        if (v === undefined) return false;
        if (op === '<') return v < target;
        if (op === '>') return v > target;
        return v === target;
      },
    };
  }
  // payload.path.to.field~value | =value
  const payloadMatch = /^payload\.([\w.]+)([~=])(.+)$/.exec(token);
  if (payloadMatch) {
    const path = payloadMatch[1].split('.');
    const op = payloadMatch[2] as '~' | '=';
    const expected = payloadMatch[3];
    return {
      predicate: (entry) => valueMatches(getByPath(entry.payload, path), op, expected),
    };
  }
  // /regex/flags free regex
  if (token.startsWith('/')) {
    const re = parseRegex(token);
    if (!re) return { error: `Invalid regex: ${token}` };
    return { predicate: (entry) => re.test(entry.message) || re.test(String(entry.payload ?? '')) };
  }
  // key:value
  const colonIdx = token.indexOf(':');
  if (colonIdx > 0) {
    const key = token.slice(0, colonIdx).toLowerCase();
    const value = stripQuotes(token.slice(colonIdx + 1));
    if (CHIP_KEYS.has(key) && value === '') {
      return { predicate: () => true };
    }
    if (key === 'tag') {
      const upper = value.toUpperCase();
      if (!TAG_SET.has(upper)) return { error: `Unknown tag: ${value}` };
      return { predicate: (entry) => entry.tag === (upper as LogTag) };
    }
    if (key === 'level') {
      const lower = value.toLowerCase();
      if (!LEVEL_SET.has(lower)) return { error: `Unknown level: ${value}` };
      return { predicate: (entry) => entry.level === (lower as LogLevel) };
    }
    if (key === 'source') {
      const lower = value.toLowerCase();
      if (!SOURCE_SET.has(lower)) return { error: `Unknown source: ${value}` };
      const src = lower as LogSource;
      return { predicate: (entry) => entrySource(entry) === src };
    }
    if (key === 'id') {
      return {
        predicate: (entry) => {
          const ids = findDeepValueByKey(entry.payload, 'ID');
          if (ids.length === 0) return false;
          return ids.some((v) => String(v) === value);
        },
      };
    }
    if (key === 'cmd') {
      const expectedUpper = value.toUpperCase();
      return {
        predicate: (entry) => {
          const cmds = findDeepValueByKey(entry.payload, 'CMD');
          return cmds.some((v) => typeof v === 'string' && v.toUpperCase().includes(expectedUpper));
        },
      };
    }
    if (key === 'payload') {
      // bare payload:value (no path) -> deep substring of stringified payload
      return {
        predicate: (entry) => {
          if (entry.payload === undefined) return false;
          return JSON.stringify(entry.payload).toLowerCase().includes(value.toLowerCase());
        },
      };
    }
  }
  // free-text term
  const term = stripQuotes(token).toLowerCase();
  return {
    freeText: term,
    predicate: (entry) => {
      if (entry.message.toLowerCase().includes(term)) return true;
      if (entry.tag.toLowerCase().includes(term)) return true;
      if (entry.payload !== undefined && JSON.stringify(entry.payload).toLowerCase().includes(term)) return true;
      return false;
    },
  };
}

export function compileLogQuery(input: string): CompiledQuery {
  const trimmed = input.trim();
  if (!trimmed) {
    return { predicate: () => true, isEmpty: true, freeTextTerms: [] };
  }
  const tokens = tokenize(trimmed);
  const predicates: LogPredicate[] = [];
  const freeText: string[] = [];
  let error: string | undefined;
  for (const tok of tokens) {
    const compiled = compileToken(tok);
    if ('error' in compiled) { error = compiled.error; continue; }
    predicates.push(compiled.predicate);
    if (compiled.freeText) freeText.push(compiled.freeText);
  }
  return {
    predicate: (entry) => predicates.every((p) => p(entry)),
    isEmpty: predicates.length === 0,
    freeTextTerms: freeText,
    error,
  };
}

export function applyLogQuery(entries: LogEntry[], input: string): LogEntry[] {
  const q = compileLogQuery(input);
  if (q.isEmpty) return entries;
  return entries.filter(q.predicate);
}

export type ChipKind = 'tag' | 'source' | 'level' | 'id' | 'cmd';

export interface ChipToken {
  kind: ChipKind;
  value: string;
  raw: string;
}

const CHIP_KEYS: ReadonlySet<string> = new Set(['tag', 'source', 'level', 'id', 'cmd']);

function classifyToken(token: string): ChipToken | undefined {
  const colon = token.indexOf(':');
  if (colon <= 0) return undefined;
  const key = token.slice(0, colon).toLowerCase();
  if (!CHIP_KEYS.has(key)) return undefined;
  const value = stripQuotes(token.slice(colon + 1));
  if (!value) return undefined;
  switch (key) {
    case 'tag': {
      const u = value.toUpperCase();
      if (!TAG_SET.has(u)) return undefined;
      return { kind: 'tag', value: u, raw: `tag:${u}` };
    }
    case 'source': {
      const l = value.toLowerCase();
      if (!SOURCE_SET.has(l)) return undefined;
      return { kind: 'source', value: l, raw: `source:${l}` };
    }
    case 'level': {
      const l = value.toLowerCase();
      if (!LEVEL_SET.has(l)) return undefined;
      return { kind: 'level', value: l, raw: `level:${l}` };
    }
    case 'id':  return { kind: 'id',  value, raw: `id:${value}` };
    case 'cmd': return { kind: 'cmd', value, raw: `cmd:${value}` };
    default:    return undefined;
  }
}

export interface SplitQuery {
  chips: ChipToken[];
  trailing: string;
}

export function splitQuery(input: string): SplitQuery {
  const tokens = tokenize(input);
  const chips: ChipToken[] = [];
  const rest: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    const chip = classifyToken(tok);
    if (chip && !seen.has(chip.raw)) {
      seen.add(chip.raw);
      chips.push(chip);
    } else if (!chip) {
      rest.push(tok);
    }
  }
  return { chips, trailing: rest.join(' ') };
}

export function joinQuery(parts: SplitQuery): string {
  const head = parts.chips.map((c) => c.raw).join(' ');
  const tail = parts.trailing;
  if (head && tail) return `${head} ${tail}`;
  return head || tail;
}

export function addChip(input: string, chip: ChipToken): string {
  const split = splitQuery(input);
  if (split.chips.some((c) => c.raw === chip.raw)) return joinQuery(split);
  return joinQuery({ chips: [...split.chips, chip], trailing: split.trailing });
}

export function removeChipFromInput(input: string, raw: string): string {
  const split = splitQuery(input);
  return joinQuery({ chips: split.chips.filter((c) => c.raw !== raw), trailing: split.trailing });
}

export interface CompiledChipFilters {
  predicate: LogPredicate;
  isEmpty: boolean;
  error?: string;
}

export function compileChipFilters(input: string): CompiledChipFilters {
  const split = splitQuery(input);
  if (split.chips.length === 0) {
    return { predicate: () => true, isEmpty: true };
  }
  const predicates: LogPredicate[] = [];
  let error: string | undefined;
  for (const chip of split.chips) {
    const compiled = compileToken(chip.raw);
    if ('error' in compiled) { error = compiled.error; continue; }
    predicates.push(compiled.predicate);
  }
  return {
    predicate: (entry) => predicates.every((p) => p(entry)),
    isEmpty: predicates.length === 0,
    error,
  };
}

export function extractFreeTextTerms(input: string): string[] {
  const split = splitQuery(input);
  if (!split.trailing) return [];
  const tokens = tokenize(split.trailing);
  const out: string[] = [];
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    if (colon > 0) {
      const key = tok.slice(0, colon).toLowerCase();
      if (CHIP_KEYS.has(key)) continue;
    }
    const term = stripQuotes(tok).toLowerCase();
    if (term) out.push(term);
  }
  return out;
}
