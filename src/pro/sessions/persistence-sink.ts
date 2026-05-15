// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import type { LogEntry } from '@/core/types.js';
import type { SessionSnapshot } from '@/desktop/runtime/session-controller.js';
import type { SessionMeta, SessionsAdapter } from './db.js';

export interface SinkDeps {
  loadAdapter: () => Promise<SessionsAdapter>;
  getLicensed: () => boolean;
  getSnapshot: () => SessionSnapshot;
  subscribe: (listener: () => void) => () => void;
  now?: () => number;
  flushDelayMs?: number;
  batchThreshold?: number;
}

const DEFAULT_FLUSH_DELAY_MS = 1000;
const DEFAULT_BATCH_THRESHOLD = 200;

function entryNum(id: string | undefined): number {
  if (id === undefined || !id.startsWith('e')) return -1;
  const n = Number.parseInt(id.slice(1), 10);
  return Number.isNaN(n) ? -1 : n;
}

export class SessionPersistenceSink {
  private prevConnected = false;
  private sessionId: number | null = null;
  private lastSeenEntryNum = -1;
  private nextSeq = 0;
  private pending: LogEntry[] = [];
  private flushHandle: ReturnType<typeof setTimeout> | null = null;
  private adapter: SessionsAdapter | null = null;
  private chain: Promise<void> = Promise.resolve();
  private unsubscribe: (() => void) | undefined;
  private disposed = false;

  constructor(private readonly deps: SinkDeps) {
    this.unsubscribe = deps.subscribe(() => this.onChange());
    this.onChange();
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle);
      this.flushHandle = null;
    }
    if (this.prevConnected) {
      this.prevConnected = false;
      this.handleDisconnect(this.now());
    }
  }

  /** Test-only: returns the serialized chain so tests can `await` all pending writes. */
  drain(): Promise<void> {
    return this.chain;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private onChange(): void {
    if (this.disposed) return;
    if (!this.deps.getLicensed()) {
      // License gate: if active session exists (license was revoked mid-session) drop it.
      if (this.sessionId !== null && !this.prevConnected) {
        this.sessionId = null;
      }
      return;
    }
    const snap = this.deps.getSnapshot();
    const connected = snap.connected;

    if (!this.prevConnected && connected) {
      this.prevConnected = true;
      this.startSession(snap);
    }

    if (connected && this.sessionId !== null) {
      this.collectNewEntries(snap.logEntries);
    }

    if (this.prevConnected && !connected) {
      this.prevConnected = false;
      this.handleDisconnect(this.now());
    }
  }

  private startSession(snap: SessionSnapshot): void {
    const meta: SessionMeta = {
      startedAt: new Date(this.now()).toISOString(),
      profileName: snap.activeProfileName,
      format: snap.outputFormat,
      events: snap.eventFilters.join(','),
    };
    this.lastSeenEntryNum = -1;
    this.nextSeq = 0;
    this.pending = [];
    this.queue(async () => {
      try {
        const adapter = await this.getAdapter();
        this.sessionId = await adapter.createSession(meta);
      } catch (err) {
        console.warn('[sessions] createSession failed:', err);
        this.sessionId = null;
      }
    });
  }

  private collectNewEntries(entries: readonly LogEntry[]): void {
    let collected = false;
    for (const e of entries) {
      const n = entryNum(e.entryId);
      if (n > this.lastSeenEntryNum) {
        this.lastSeenEntryNum = n;
        this.pending.push(e);
        collected = true;
      }
    }
    if (!collected) return;
    const threshold = this.deps.batchThreshold ?? DEFAULT_BATCH_THRESHOLD;
    if (this.pending.length >= threshold) {
      this.scheduleFlush(0);
    } else {
      this.scheduleFlush(this.deps.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS);
    }
  }

  private scheduleFlush(delay: number): void {
    if (this.flushHandle !== null) return;
    this.flushHandle = setTimeout(() => {
      this.flushHandle = null;
      this.queue(() => this.flush());
    }, delay);
  }

  private async flush(): Promise<void> {
    const sessionId = this.sessionId;
    if (sessionId === null) return;
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    const start = this.nextSeq;
    this.nextSeq = start + batch.length;
    try {
      const adapter = await this.getAdapter();
      await adapter.appendEntries(sessionId, batch, start);
    } catch (err) {
      console.warn('[sessions] appendEntries failed:', err);
    }
  }

  private handleDisconnect(now: number): void {
    const sessionId = this.sessionId;
    if (sessionId === null) return;
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle);
      this.flushHandle = null;
    }
    const batch = this.pending;
    this.pending = [];
    const batchStart = this.nextSeq;
    const totalCount = batchStart + batch.length;
    this.sessionId = null;
    this.nextSeq = 0;
    this.lastSeenEntryNum = -1;
    this.queue(async () => {
      try {
        const adapter = await this.getAdapter();
        if (batch.length > 0) {
          await adapter.appendEntries(sessionId, batch, batchStart);
        }
        await adapter.finalizeSession(sessionId, new Date(now).toISOString(), totalCount);
      } catch (err) {
        console.warn('[sessions] finalize failed:', err);
      }
    });
  }

  private queue(fn: () => Promise<void>): void {
    this.chain = this.chain.then(fn).catch(() => undefined);
  }

  private async getAdapter(): Promise<SessionsAdapter> {
    if (this.adapter !== null) return this.adapter;
    this.adapter = await this.deps.loadAdapter();
    return this.adapter;
  }
}
