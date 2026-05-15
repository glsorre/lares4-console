// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { createSqlAdapter, migrate } from '../db.js';
import type { LogEntry } from '@/core/types.js';

interface Row {
  [column: string]: unknown;
}

class FakeSqlDatabase {
  tables = new Map<string, Row[]>();
  private autoIncrement = new Map<string, number>();

  async execute(sql: string, bind: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId?: number }> {
    const trimmed = sql.trim();
    if (/^CREATE TABLE/i.test(trimmed)) {
      const match = /CREATE TABLE IF NOT EXISTS (\w+)/i.exec(trimmed);
      if (match) {
        const name = match[1];
        if (!this.tables.has(name)) this.tables.set(name, []);
      }
      return { rowsAffected: 0 };
    }
    if (/^CREATE INDEX/i.test(trimmed)) return { rowsAffected: 0 };
    if (/^INSERT INTO sessions/i.test(trimmed)) {
      const next = (this.autoIncrement.get('sessions') ?? 0) + 1;
      this.autoIncrement.set('sessions', next);
      const row: Row = {
        id: next,
        started_at: bind[0],
        ended_at: null,
        profile_name: bind[1],
        sender: bind[2],
        format: bind[3],
        events: bind[4],
        log_count: 0,
      };
      this.tables.get('sessions')!.push(row);
      return { rowsAffected: 1, lastInsertId: next };
    }
    if (/^INSERT OR IGNORE INTO log_entries/i.test(trimmed)) {
      const row: Row = {
        session_id: bind[0],
        seq: bind[1],
        ts: bind[2],
        level: bind[3],
        tag: bind[4],
        source: bind[5],
        entry_id: bind[6],
        message: bind[7],
        command: bind[8],
        group_id: bind[9],
        correlation_id: bind[10],
        latency_ms: bind[11],
        highlight: bind[12],
        payload_json: bind[13],
        folded_json: bind[14],
        ack_json: bind[15],
        wire_json: bind[16],
      };
      const table = this.tables.get('log_entries')!;
      if (table.some((r) => r.session_id === row.session_id && r.seq === row.seq)) {
        return { rowsAffected: 0 };
      }
      table.push(row);
      return { rowsAffected: 1 };
    }
    if (/^UPDATE sessions SET ended_at/i.test(trimmed)) {
      const row = this.tables.get('sessions')!.find((r) => r.id === bind[2]);
      if (row) {
        row.ended_at = bind[0];
        row.log_count = bind[1];
      }
      return { rowsAffected: row ? 1 : 0 };
    }
    if (/^DELETE FROM log_entries WHERE session_id/i.test(trimmed)) {
      const table = this.tables.get('log_entries')!;
      const before = table.length;
      this.tables.set('log_entries', table.filter((r) => r.session_id !== bind[0]));
      return { rowsAffected: before - this.tables.get('log_entries')!.length };
    }
    if (/^DELETE FROM sessions WHERE id/i.test(trimmed)) {
      const before = this.tables.get('sessions')!.length;
      this.tables.set('sessions', this.tables.get('sessions')!.filter((r) => r.id !== bind[0]));
      return { rowsAffected: before - this.tables.get('sessions')!.length };
    }
    if (/^DELETE FROM sessions WHERE started_at/i.test(trimmed)) {
      const cutoff = bind[0] as string;
      const before = this.tables.get('sessions')!.length;
      this.tables.set('sessions', this.tables.get('sessions')!.filter((r) => String(r.started_at) >= cutoff));
      return { rowsAffected: before - this.tables.get('sessions')!.length };
    }
    throw new Error(`unhandled execute: ${trimmed}`);
  }

  async select<T>(sql: string, bind: unknown[] = []): Promise<T> {
    const trimmed = sql.trim().replace(/\s+/g, ' ');
    if (trimmed.startsWith('SELECT id, started_at, ended_at, profile_name')) {
      let rows = [...(this.tables.get('sessions') ?? [])];
      if (/WHERE id = \?/.test(trimmed)) {
        rows = rows.filter((r) => r.id === bind[0]);
      } else {
        rows.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
        const limit = bind[0] as number;
        rows = rows.slice(0, limit);
      }
      return rows as unknown as T;
    }
    if (trimmed.startsWith('SELECT seq, ts, level, tag')) {
      const rows = (this.tables.get('log_entries') ?? [])
        .filter((r) => r.session_id === bind[0])
        .sort((a, b) => (a.seq as number) - (b.seq as number));
      return rows as unknown as T;
    }
    if (trimmed.startsWith('SELECT id FROM sessions WHERE started_at')) {
      const cutoff = bind[0] as string;
      const rows = (this.tables.get('sessions') ?? [])
        .filter((r) => String(r.started_at) < cutoff)
        .map((r) => ({ id: r.id }));
      return rows as unknown as T;
    }
    throw new Error(`unhandled select: ${trimmed}`);
  }
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    ts: '2026-05-15T12:00:00.000Z',
    level: 'info',
    tag: 'SYSTEM',
    message: 'hello',
    source: 'lifecycle',
    entryId: 'e0',
    ...overrides,
  };
}

describe('sessions/db', () => {
  let db: FakeSqlDatabase;
  beforeEach(async () => {
    db = new FakeSqlDatabase();
    await migrate(db);
  });

  it('creates the schema idempotently', async () => {
    await migrate(db);
    await migrate(db);
    assert.ok(db.tables.has('sessions'));
    assert.ok(db.tables.has('log_entries'));
  });

  it('round-trips a session lifecycle', async () => {
    const adapter = createSqlAdapter(db);
    const id = await adapter.createSession({ startedAt: '2026-05-15T10:00:00Z', profileName: 'lab' });
    await adapter.appendEntries(id, [entry({ entryId: 'e1', message: 'one' }), entry({ entryId: 'e2', message: 'two' })], 0);
    await adapter.appendEntries(id, [entry({ entryId: 'e3', message: 'three' })], 2);
    await adapter.finalizeSession(id, '2026-05-15T11:00:00Z', 3);

    const sessions = await adapter.listSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, id);
    assert.equal(sessions[0].endedAt, '2026-05-15T11:00:00Z');
    assert.equal(sessions[0].logCount, 3);

    const entries = await adapter.loadSessionEntries(id);
    assert.equal(entries.length, 3);
    assert.deepEqual(entries.map((e) => e.message), ['one', 'two', 'three']);

    const loaded = await adapter.loadSession(id);
    assert.equal(loaded?.profileName, 'lab');
  });

  it('serializes and restores payload/folded/ack/wireFrame as JSON', async () => {
    const adapter = createSqlAdapter(db);
    const id = await adapter.createSession({ startedAt: '2026-05-15T10:00:00Z' });
    const original = entry({
      payload: { a: 1, b: [2, 3] },
      folded: { preview: 'p', full: 'pfull' },
      ack: { result: 'ok', latencyMs: 12 },
      wireFrame: { content: 'raw', ts: '2026-05-15T10:00:00Z' },
    });
    await adapter.appendEntries(id, [original], 0);
    const [restored] = await adapter.loadSessionEntries(id);
    assert.deepEqual(restored.payload, original.payload);
    assert.deepEqual(restored.folded, original.folded);
    assert.deepEqual(restored.ack, original.ack);
    assert.deepEqual(restored.wireFrame, original.wireFrame);
  });

  it('deleteSession cascades into log_entries', async () => {
    const adapter = createSqlAdapter(db);
    const id = await adapter.createSession({ startedAt: '2026-05-15T10:00:00Z' });
    await adapter.appendEntries(id, [entry(), entry({ entryId: 'e1' })], 0);
    await adapter.deleteSession(id);
    assert.equal((await adapter.listSessions()).length, 0);
    assert.equal((await adapter.loadSessionEntries(id)).length, 0);
  });

  it('purgeOlderThan drops sessions started before the cutoff', async () => {
    const adapter = createSqlAdapter(db);
    const old = await adapter.createSession({ startedAt: '2026-01-01T00:00:00Z' });
    const fresh = await adapter.createSession({ startedAt: '2026-05-10T00:00:00Z' });
    await adapter.appendEntries(old, [entry()], 0);
    await adapter.appendEntries(fresh, [entry()], 0);

    await adapter.purgeOlderThan('2026-04-01T00:00:00Z');
    const remaining = await adapter.listSessions();
    assert.deepEqual(remaining.map((s) => s.id), [fresh]);
    assert.equal((await adapter.loadSessionEntries(old)).length, 0);
  });
});
