/** Tailwind classes for connection status chips (uses CSS vars from styles.css). */

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

import { resultDetailSeverity } from '../../core/protocol-dict.js';

/** Tailwind classes for an ACK RESULT chip. Driven by the protocol dict severity. */
export function ackResultChipClasses(detail: string | undefined): string {
  switch (resultDetailSeverity(detail)) {
    case 'success':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    case 'pending':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
    case 'error':
      return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30';
    default:
      return 'bg-muted/70 text-muted-foreground border-border/50';
  }
}
