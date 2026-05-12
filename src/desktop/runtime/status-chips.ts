/** Tailwind classes for connection / replay status chips (uses CSS vars from styles.css). */

export function connectionChipClasses(connectionStatus: string): string {
  switch (connectionStatus) {
    case 'online':
      return 'bg-conn-online text-conn-online-fg border-conn-online/40';
    case 'connecting':
      return 'bg-conn-connecting text-conn-connecting-fg border-conn-connecting/40';
    case 'error':
      return 'bg-conn-error text-conn-error-fg border-conn-error/40';
    case 'idle':
    default:
      return 'bg-conn-idle text-conn-idle-fg border-conn-idle/40';
  }
}

/** Heuristic: treat replay as “idle” when off, otherwise highlight. */
export function replayChipClasses(replayStatus: string): string {
  const s = replayStatus.toLowerCase();
  if (s === 'off' || s === 'idle' || s === '') {
    return 'bg-replay-muted text-replay-muted-fg border-replay-muted/50';
  }
  return 'bg-replay-active text-replay-active-fg border-replay-active/45';
}

export function formatReplayLabel(status: string): string {
  const s = status.trim();
  if (!s) return 'Off';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
