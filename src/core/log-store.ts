import { nowIso, redactSecrets } from './utils.js';
import type { LogEntry } from './types.js';

export interface Bookmark {
  groupId: string;
  note?: string;
  createdAt: string;
}

export class LogStore {
  private readonly entries: LogEntry[] = [];
  private revision = 0;
  private readonly bookmarks = new Map<string, Bookmark>();
  constructor(private readonly maxSize: number = 3000) {}

  push(entry: Omit<LogEntry, 'ts'> & { ts?: string }): void {
    this.entries.push({
      ...entry,
      ts: entry.ts ?? nowIso(),
      source: entry.source ?? 'lifecycle',
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
    this.bookmarks.clear();
    this.revision += 1;
  }

  toggleBookmark(groupId: string, note?: string): boolean {
    if (this.bookmarks.has(groupId)) {
      this.bookmarks.delete(groupId);
      this.revision += 1;
      return false;
    }
    this.bookmarks.set(groupId, { groupId, note, createdAt: nowIso() });
    this.revision += 1;
    return true;
  }

  setBookmarkNote(groupId: string, note: string | undefined): void {
    const existing = this.bookmarks.get(groupId);
    if (!existing) return;
    this.bookmarks.set(groupId, { ...existing, note: note?.length ? note : undefined });
    this.revision += 1;
  }

  isBookmarked(groupId: string): boolean {
    return this.bookmarks.has(groupId);
  }

  listBookmarks(): Bookmark[] {
    return [...this.bookmarks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  patchByGroupId(groupId: string, patch: Partial<LogEntry>): number {
    let count = 0;
    for (const entry of this.entries) {
      if (entry.groupId !== groupId) continue;
      Object.assign(entry, patch);
      count += 1;
    }
    if (count > 0) this.revision += 1;
    return count;
  }

  patchLast(predicate: (entry: LogEntry) => boolean, patch: Partial<LogEntry>): boolean {
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i];
      if (!entry || !predicate(entry)) continue;
      Object.assign(entry, patch);
      this.revision += 1;
      return true;
    }
    return false;
  }
}
