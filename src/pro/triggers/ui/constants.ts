// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in ../LICENSE.

import { Bell, Pause, Volume2, Zap } from 'lucide-react';
import type { HighlightColor, TriggerActionKind } from '../engine.js';

export const ACTION_OPTIONS: ReadonlyArray<{
  kind: TriggerActionKind;
  labelKey: string;
  icon: typeof Zap;
}> = [
  { kind: 'highlight', labelKey: 'pro.triggers.action.highlight', icon: Zap },
  { kind: 'beep', labelKey: 'pro.triggers.action.beep', icon: Volume2 },
  { kind: 'notify', labelKey: 'pro.triggers.action.notify', icon: Bell },
  { kind: 'pause', labelKey: 'pro.triggers.action.pause', icon: Pause },
];

export const COLORS: ReadonlyArray<{
  value: HighlightColor;
  labelKey: string;
  swatch: string;
  cssVar: string;
}> = [
  { value: 'red', labelKey: 'pro.triggers.color.red', swatch: 'bg-red-500', cssVar: 'var(--color-red-500)' },
  { value: 'amber', labelKey: 'pro.triggers.color.amber', swatch: 'bg-amber-500', cssVar: 'var(--color-amber-500)' },
  { value: 'emerald', labelKey: 'pro.triggers.color.emerald', swatch: 'bg-emerald-500', cssVar: 'var(--color-emerald-500)' },
  { value: 'blue', labelKey: 'pro.triggers.color.blue', swatch: 'bg-blue-500', cssVar: 'var(--color-blue-500)' },
  { value: 'violet', labelKey: 'pro.triggers.color.violet', swatch: 'bg-violet-500', cssVar: 'var(--color-violet-500)' },
];
