export interface ParseNumberOptions {
  min?: number;
  max?: number;
  integer?: boolean;
}

export function parseNumber(raw: string | undefined, field: string, opts?: ParseNumberOptions): number {
  if (!raw) {
    throw new Error(`Missing required numeric argument: ${field}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number for ${field}: ${raw}`);
  }
  if (opts?.integer && !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer, got: ${raw}`);
  }
  if (opts?.min !== undefined && value < opts.min) {
    throw new Error(`${field} must be >= ${String(opts.min)}, got: ${raw}`);
  }
  if (opts?.max !== undefined && value > opts.max) {
    throw new Error(`${field} must be <= ${String(opts.max)}, got: ${raw}`);
  }
  return value;
}

export function parseCommandTokens(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const ch of trimmed) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === '\\') {
      escaping = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (escaping) {
    current += '\\';
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
