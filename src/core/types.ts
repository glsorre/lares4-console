export type OutputFormat = 'pretty' | 'json';
export type EventFilter = 'all' | 'none' | 'acks' | 'errors' | 'multitypes' | 'raw' | 'changes' | 'sent';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogTag = 'ACK' | 'RAW_RX' | 'RAW_TX' | 'BULK' | 'CHANGE' | 'ERROR' | 'LOG' | 'SYSTEM';

/** Origin category for a log entry — orthogonal to {@link LogTag}. */
export type LogSource = 'command' | 'lifecycle' | 'wire';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  tag: LogTag;
  /** Stable per-entry id assigned by the LogStore at push time. Used by the UI to key
   *  rows that have no `groupId` (RAW_RX, SYSTEM, CHANGE, ERROR) so selection stays
   *  consistent across filtered views. */
  entryId?: string;
  /**
   * Origin of this entry: user-issued command, library lifecycle event, or unattributed wire frame.
   * Optional in the type to keep test fixtures terse; production code must always set it. Use
   * {@link entrySource} when reading to coalesce undefined to `'lifecycle'`.
   */
  source?: LogSource;
  message: string;
  /** Shared id for lines that belong to the same rendered message block. */
  groupId?: string;
  payload?: unknown;
  folded?: {
    preview: string;
    full: string;
  };
  /** Shared cookie linking a TX with its matching ACK. */
  correlationId?: string;
  /** Round-trip latency in ms (recorded on ACK entry). */
  latencyMs?: number;
  /** Color tint from matched trigger rule. */
  highlight?: 'red' | 'amber' | 'emerald' | 'blue' | 'violet';
  /**
   * Correlated ACK metadata patched onto the matching RAW_TX group. Present on TX entries
   * once the panel's response arrives; allows the UI to render the ACK inline rather than
   * as a separate row.
   */
  ack?: {
    result?: string;
    latencyMs?: number;
    payload?: unknown;
    ts?: string;
  };
}

/** Read the entry's source, defaulting to `'lifecycle'` for entries persisted before the field existed. */
export function entrySource(entry: Pick<LogEntry, 'source'>): LogSource {
  return entry.source ?? 'lifecycle';
}

export interface UiState {
  wrapEnabled: boolean;
  horizontalOffset: number;
  rawFullEnabled: boolean;
  followTail: boolean;
  scrollOffset: number;
  commandLine: string;
}
