import { ROOT_COMMANDS, SECONDARY_COMMANDS } from './command-spec.js';

function tokenize(input: string): { parts: string[]; trailingSpace: boolean } {
  const trailingSpace = /\s$/.test(input);
  const trimmed = input.trim();
  const parts = trimmed ? trimmed.split(/\s+/) : [];
  return { parts, trailingSpace };
}

export function applyCompletion(input: string, suggestion: string): string {
  const { parts, trailingSpace } = tokenize(input);
  if (parts.length === 0) {
    return `${suggestion} `;
  }
  if (parts.length <= 1 && !trailingSpace) {
    return `${suggestion} `;
  }
  if (parts[0] === 'raw' && parts[1] === 'full') {
    const base = trailingSpace ? [...parts, suggestion] : [...parts.slice(0, 2), suggestion];
    return `${base.join(' ')} `;
  }
  const targetIndex = trailingSpace ? parts.length : Math.max(0, parts.length - 1);
  const next = [...parts];
  if (targetIndex === next.length) {
    next.push(suggestion);
  } else {
    next[targetIndex] = suggestion;
  }
  return `${next.join(' ')} `;
}

export function suggestCompletions(input: string): string[] {
  const { parts, trailingSpace } = tokenize(input);
  if (parts.length === 0) {
    return [...ROOT_COMMANDS];
  }
  if (parts.length === 1 && !trailingSpace) {
    const current = parts[0];
    return ROOT_COMMANDS.filter((cmd) => cmd.startsWith(current));
  }

  const root = parts[0] ?? '';
  if (root === 'raw' && parts[1] === 'full') {
    const current = trailingSpace ? '' : (parts[2] ?? '');
    return ['on', 'off'].filter((opt) => opt.startsWith(current));
  }

  const options = SECONDARY_COMMANDS[root] ?? [];
  const targetIndex = trailingSpace ? parts.length : Math.max(0, parts.length - 1);
  if (targetIndex > 1) return [];
  const current = targetIndex === 1 ? (parts[1] ?? '') : '';
  const exact = options.filter((opt) => opt === current);
  const prefix = options.filter((opt) => opt !== current && opt.startsWith(current));
  return [...exact, ...prefix];
}
