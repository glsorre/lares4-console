export type FocusArea = 'command' | 'scroll';
export type ArrowDirection = 'up' | 'down';
export type ArrowIntent = 'ignore' | 'history' | 'scroll';

export function toggleFocusArea(current: FocusArea): FocusArea {
  return current === 'command' ? 'scroll' : 'command';
}

export function resolveArrowIntent(args: {
  focusArea: FocusArea;
  input: string;
  suppressUntilMs: number;
  lastWheelAtMs: number;
  nowMs: number;
}): ArrowIntent {
  const { focusArea, input, suppressUntilMs, lastWheelAtMs, nowMs } = args;
  if (nowMs < suppressUntilMs) return 'ignore';
  if (focusArea === 'scroll') return 'scroll';
  if (nowMs - lastWheelAtMs <= 500) return 'scroll';
  if (input.trim().length === 0) return 'scroll';
  return 'history';
}

