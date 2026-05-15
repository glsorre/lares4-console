import type { LogTag } from '../../core/types.js';

export function getTagDotClass(tag: LogTag): string {
  switch (tag) {
    case 'ACK':    return 'bg-teal-500';
    case 'CHANGE': return 'bg-amber-500';
    case 'ERROR':  return 'bg-red-500';
    case 'LOG':    return 'bg-sky-500';
    case 'SYSTEM': return 'bg-slate-500';
    case 'RAW_RX': return 'bg-violet-500';
    case 'BULK':   return 'bg-cyan-500';
    case 'RAW_TX': return 'bg-indigo-500';
    default:       return 'bg-muted-foreground';
  }
}

export function getTagClasses(tag: LogTag): string {
  switch (tag) {
    case 'ACK':    return 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300';
    case 'CHANGE': return 'border border-amber-800 bg-amber-200 text-amber-900 dark:border-amber-300 dark:bg-amber-950 dark:text-amber-200';
    case 'ERROR':  return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400';
    case 'LOG':    return 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300';
    case 'SYSTEM': return 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400';
    case 'RAW_RX': return 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300';
    case 'BULK':   return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300';
    case 'RAW_TX': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300';
    default:       return 'bg-muted text-muted-foreground';
  }
}
