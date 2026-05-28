// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SessionPersistenceSink } from '../persistence-sink.js';
import type { SessionsAdapter, SessionMeta } from '../db.js';
import type { LogEntry } from '@/core/types.js';
import type { SessionSnapshot } from '@/desktop/runtime/session-controller.js';

interface RecordedCall {
  kind: 'create' | 'append' | 'finalize';
  payload: unknown;
}

function makeAdapter(): { adapter: SessionsAdapter; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let nextId = 100;
  const adapter: SessionsAdapter = {
    async createSession(meta: SessionMeta) {
      calls.push({ kind: 'create', payload: meta });
      const id = nextId++;
      return id;
    },
    async appendEntries(sessionId, entries, startSeq) {
      calls.push({ kind: 'append', payload: { sessionId, entries: entries.map((e) => e.entryId), startSeq } });
    },
    async finalizeSession(sessionId, endedAt, logCount) {
      calls.push({ kind: 'finalize', payload: { sessionId, endedAt, logCount } });
    },
    async listSessions() { return []; },
    async loadSession() { return null; },
    async loadSessionEntries() { return []; },
    async deleteSession() { /* no-op */ },
    async purgeOlderThan() { /* no-op */ },
  };
  return { adapter, calls };
}

function makeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    connected: false,
    connectionStatus: 'idle',
    outputFormat: 'pretty',
    eventFilters: [],
    logEntries: [],
    commandLine: '',
    error: undefined,
    logTagFilters: undefined,
    activeProfileName: undefined,
    macros: [],
    activeMacro: undefined,
    recordingMacro: false,
    recordingMacroSteps: 0,
    recordingMacroStartedAt: undefined,
    topology: { groups: [], total: 0 },
    topologyDiff: { addedIds: new Set(), removedIds: new Set() },
    bookmarks: [],
    triggers: [],
    pendingTxCount: 0,
    liveStreamPaused: false,
    readOnly: false,
    licensed: { macros: false, tabs: false, triggers: false, annotations: false, multiwindow: false, sessions: false, repl: false },
    ...overrides,
  };
}

function entry(id: string, message = 'm'): LogEntry {
  return { ts: '2026-05-15T10:00:00Z', level: 'info', tag: 'SYSTEM', message, entryId: id, source: 'lifecycle' };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('SessionPersistenceSink', () => {
  it('no-ops while unlicensed', async () => {
    const { adapter, calls } = makeAdapter();
    let snap = makeSnapshot();
    const listeners = new Set<() => void>();
    const sink = new SessionPersistenceSink({
      loadAdapter: () => Promise.resolve(adapter),
      getLicensed: () => false,
      getSnapshot: () => snap,
      subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    });
    snap = makeSnapshot({ connected: true });
    for (const l of listeners) l();
    await sink.drain();
    assert.deepEqual(calls, []);
    sink.dispose();
  });

  it('creates a session on connect and finalizes on disconnect', async () => {
    const { adapter, calls } = makeAdapter();
    let snap = makeSnapshot();
    const listeners = new Set<() => void>();
    const sink = new SessionPersistenceSink({
      loadAdapter: () => Promise.resolve(adapter),
      getLicensed: () => true,
      getSnapshot: () => snap,
      subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
      flushDelayMs: 1,
      batchThreshold: 100,
    });

    snap = makeSnapshot({ connected: true, activeProfileName: 'lab' });
    for (const l of listeners) l();
    await flushMicrotasks();

    snap = makeSnapshot({ connected: true, activeProfileName: 'lab', logEntries: [entry('e0'), entry('e1')] });
    for (const l of listeners) l();
    await new Promise((r) => setTimeout(r, 10));
    await sink.drain();

    snap = makeSnapshot({ connected: false });
    for (const l of listeners) l();
    await sink.drain();

    const kinds = calls.map((c) => c.kind);
    assert.deepEqual(kinds, ['create', 'append', 'finalize']);
    const append = calls.find((c) => c.kind === 'append');
    assert.deepEqual((append!.payload as { entries: string[] }).entries, ['e0', 'e1']);
    const finalize = calls.find((c) => c.kind === 'finalize');
    assert.equal((finalize!.payload as { logCount: number }).logCount, 2);
    sink.dispose();
  });

  it('flushes immediately when the batch threshold is hit', async () => {
    const { adapter, calls } = makeAdapter();
    const big: LogEntry[] = [];
    for (let i = 0; i < 200; i += 1) big.push(entry(`e${String(i)}`));
    let snap = makeSnapshot();
    const listeners = new Set<() => void>();
    const sink = new SessionPersistenceSink({
      loadAdapter: () => Promise.resolve(adapter),
      getLicensed: () => true,
      getSnapshot: () => snap,
      subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
      flushDelayMs: 10_000,
      batchThreshold: 50,
    });
    snap = makeSnapshot({ connected: true });
    for (const l of listeners) l();
    await flushMicrotasks();
    snap = makeSnapshot({ connected: true, logEntries: big });
    for (const l of listeners) l();
    await new Promise((r) => setTimeout(r, 5));
    await sink.drain();
    const appends = calls.filter((c) => c.kind === 'append');
    assert.equal(appends.length >= 1, true);
    const total = appends.reduce((n, c) => n + (c.payload as { entries: string[] }).entries.length, 0);
    assert.equal(total, 200);
    sink.dispose();
  });
});
