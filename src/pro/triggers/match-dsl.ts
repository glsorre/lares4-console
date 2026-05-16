// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in ./LICENSE.

import { splitQuery, type ChipToken } from '../../core/log-query.js';

export type ConditionField = 'tag' | 'level' | 'source' | 'id' | 'cmd';
export type ConditionOp = 'is' | 'contains';

export interface Condition {
  id: string;
  field: ConditionField;
  op: ConditionOp;
  value: string;
}

export interface ParsedMatch {
  conditions: Condition[];
  advanced: string;
}

export const CONDITION_FIELDS: readonly ConditionField[] = ['tag', 'level', 'source', 'id', 'cmd'];

function genId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `c-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

function chipToCondition(chip: ChipToken): Condition {
  const op: ConditionOp = chip.kind === 'cmd' ? 'contains' : 'is';
  return { id: genId(), field: chip.kind, op, value: chip.value };
}

export function parseMatch(dsl: string): ParsedMatch {
  const split = splitQuery(dsl ?? '');
  return {
    conditions: split.chips.map(chipToCondition),
    advanced: split.trailing.trim(),
  };
}

function normaliseConditionValue(field: ConditionField, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (field === 'tag') return trimmed.toUpperCase();
  if (field === 'level' || field === 'source') return trimmed.toLowerCase();
  return trimmed;
}

export function buildMatch(parsed: ParsedMatch): string {
  const tokens: string[] = [];
  for (const cond of parsed.conditions) {
    const value = normaliseConditionValue(cond.field, cond.value);
    if (!value) continue;
    tokens.push(`${cond.field}:${value}`);
  }
  const adv = parsed.advanced.trim();
  if (adv) tokens.push(adv);
  return tokens.join(' ');
}

export function opsForField(field: ConditionField): readonly ConditionOp[] {
  if (field === 'cmd') return ['contains'];
  return ['is'];
}

export function makeCondition(field: ConditionField = 'tag'): Condition {
  return { id: genId(), field, op: opsForField(field)[0]!, value: '' };
}
