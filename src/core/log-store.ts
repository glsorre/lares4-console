import { nowIso, redactSecrets } from './utils.js';
import type { LogEntry } from './types.js';

export class LogStore {
  private readonly entries: LogEntry[] = [];
  private revision = 0;
  constructor(private readonly maxSize: number = 3000) {}

  push(entry: Omit<LogEntry, 'ts'> & { ts?: string }): void {
    this.entries.push({
      ...entry,
      ts: entry.ts ?? nowIso(),
      message: redactSecrets(entry.message),
    });
    if (this.entries.length > this.maxSize) {
      this.entries.splice(0, this.entries.length - this.maxSize);
    }
    this.revision += 1;
  }

  all(): LogEntry[] {
    return [...this.entries];
  }

  view(): readonly LogEntry[] {
    return this.entries;
  }

  version(): number {
    return this.revision;
  }

  clear(): void {
    this.entries.length = 0;
    this.revision += 1;
  }
}
