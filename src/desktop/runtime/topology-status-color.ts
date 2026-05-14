import type { TopologyNode } from '../../core/topology.js';

/**
 * Status → dot color. Single source of truth used by both the compact
 * topology rows and the recent-activity rows so the link between activity
 * and tree stays consistent at a glance.
 */
export function statusColorVar(status: TopologyNode['status']): string {
  switch (status) {
    case 'on':
      return 'oklch(0.55 0.12 138)';
    case 'open':
      return 'oklch(0.65 0.16 75)';
    case 'armed':
      return 'oklch(0.5 0.13 320)';
    case 'bypassed':
      return 'oklch(0.55 0.13 290)';
    case 'alarm':
    case 'error':
      return 'oklch(0.6 0.2 22)';
    case 'off':
    case 'closed':
    case 'disarmed':
    case 'unknown':
    default:
      return 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)';
  }
}
