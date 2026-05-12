export type OutputFormat = 'pretty' | 'json';
export type EventFilter = 'all' | 'none' | 'acks' | 'errors' | 'multitypes' | 'raw' | 'changes' | 'sent';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogTag = 'ACK' | 'RAW_RX' | 'RAW_TX' | 'BULK' | 'CHANGE' | 'ERROR' | 'LOG' | 'SYSTEM';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  tag: LogTag;
  message: string;
  /** Shared id for lines that belong to the same rendered message block. */
  groupId?: string;
  payload?: unknown;
  folded?: {
    preview: string;
    full: string;
  };
}

export interface UiState {
  wrapEnabled: boolean;
  horizontalOffset: number;
  rawFullEnabled: boolean;
  followTail: boolean;
  scrollOffset: number;
  commandLine: string;
}
