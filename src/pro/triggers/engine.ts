import type { LogEntry } from '../../core/types.js';
import { compileLogQuery } from '../../core/log-query.js';

export type TriggerActionKind = 'highlight' | 'beep' | 'notify' | 'pause';

export type HighlightColor = 'red' | 'amber' | 'emerald' | 'blue' | 'violet';

export interface TriggerAction {
  kind: TriggerActionKind;
  /** Highlight color (only for highlight). */
  color?: HighlightColor;
  /** Optional message override for notify. */
  message?: string;
}

export interface TriggerRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Log query DSL string. */
  match: string;
  actions: TriggerAction[];
}

export interface TriggerEvaluation {
  matchedRuleIds: string[];
  highlightColor?: HighlightColor;
  beep: boolean;
  notify: Array<{ ruleName: string; message: string }>;
  pause: boolean;
}

const COLOR_PRIORITY: Record<HighlightColor, number> = {
  red: 5,
  amber: 4,
  violet: 3,
  blue: 2,
  emerald: 1,
};

export function evaluateTriggers(entry: LogEntry, rules: readonly TriggerRule[]): TriggerEvaluation {
  const result: TriggerEvaluation = {
    matchedRuleIds: [],
    beep: false,
    notify: [],
    pause: false,
  };
  let bestColorRank = -1;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const compiled = compileLogQuery(rule.match);
    if (compiled.isEmpty) continue;
    if (!compiled.predicate(entry)) continue;
    result.matchedRuleIds.push(rule.id);
    for (const action of rule.actions) {
      if (action.kind === 'highlight') {
        const color: HighlightColor = action.color ?? 'amber';
        const rank = COLOR_PRIORITY[color] ?? 0;
        if (rank > bestColorRank) {
          bestColorRank = rank;
          result.highlightColor = color;
        }
      } else if (action.kind === 'beep') {
        result.beep = true;
      } else if (action.kind === 'notify') {
        result.notify.push({ ruleName: rule.name, message: action.message ?? entry.message });
      } else if (action.kind === 'pause') {
        result.pause = true;
      }
    }
  }
  return result;
}

export function validateTriggerMatch(match: string): { ok: true } | { ok: false; error: string } {
  const compiled = compileLogQuery(match);
  if (compiled.error) return { ok: false, error: compiled.error };
  if (compiled.isEmpty) return { ok: false, error: 'Match query cannot be empty.' };
  return { ok: true };
}
