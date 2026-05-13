/** Tailwind classes for connection / replay status chips (uses CSS vars from styles.css). */

export type ConnectionPhase = 'idle' | 'connecting' | 'online' | 'error';

export function connectionChipClasses(connectionStatus: string): string {
  switch (connectionStatus) {
    case 'online':
      return 'bg-conn-online text-conn-online-fg border-conn-online/40';
    case 'connecting':
      return 'bg-conn-connecting text-conn-connecting-fg border-conn-connecting/40 animate-pulse';
    case 'error':
      return 'bg-conn-error text-conn-error-fg border-conn-error/40';
    case 'idle':
    default:
      return 'bg-conn-idle text-conn-idle-fg border-conn-idle/40';
  }
}

export type ReplayPhase = 'off' | 'paused' | 'streaming' | 'done';

export function replayPhase(replayStatus: string): ReplayPhase {
  const s = replayStatus.toLowerCase().trim();
  if (!s || s === 'off') return 'off';
  if (s === 'paused') return 'paused';
  if (s === 'done') return 'done';
  if (s.startsWith('playing') || s.startsWith('streaming')) return 'streaming';
  return 'streaming';
}

export function replayChipClasses(replayStatus: string): string {
  const phase = replayPhase(replayStatus);
  switch (phase) {
    case 'streaming':
      return 'bg-replay-active text-replay-active-fg border-replay-active/45';
    case 'paused':
      return 'bg-replay-muted text-replay-muted-fg border-replay-active/40';
    case 'done':
      return 'bg-replay-muted text-replay-muted-fg border-replay-muted/50';
    case 'off':
    default:
      return 'bg-replay-muted text-replay-muted-fg border-replay-muted/50';
  }
}

export function formatReplayLabel(status: string): string {
  const s = status.trim();
  if (!s) return 'Off';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
