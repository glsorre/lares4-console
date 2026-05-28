// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in src/pro/repl.

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { createSqlAdapter, migrate } from '../snippets-db.js';

interface Row {
  id: number;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** Minimal in-memory SqlDatabase that covers the subset of SQL the snippets adapter issues. */
class FakeDb {
  private rows: Row[] = [];
  private nextId = 1;
  schemaApplied = 0;

  async execute(query: string, params: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId?: number }> {
    const q = query.replace(/\s+/g, ' ').trim();
    if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) {
      this.schemaApplied += 1;
      return { rowsAffected: 0 };
    }
    if (q.startsWith('INSERT INTO repl_snippets')) {
      const id = this.nextId; this.nextId += 1;
      const [name, body, created, updated] = params as [string, string, string, string];
      this.rows.push({ id, name, body, created_at: created, updated_at: updated });
      return { rowsAffected: 1, lastInsertId: id };
    }
    if (q.startsWith('UPDATE repl_snippets SET body')) {
      const [body, updated, id] = params as [string, string, number];
      const row = this.rows.find((r) => r.id === id);
      if (row) { row.body = body; row.updated_at = updated; }
      return { rowsAffected: row ? 1 : 0 };
    }
    if (q.startsWith('UPDATE repl_snippets SET name')) {
      const [name, updated, id] = params as [string, string, number];
      const row = this.rows.find((r) => r.id === id);
      if (row) { row.name = name; row.updated_at = updated; }
      return { rowsAffected: row ? 1 : 0 };
    }
    if (q.startsWith('DELETE FROM repl_snippets')) {
      const [id] = params as [number];
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => r.id !== id);
      return { rowsAffected: before - this.rows.length };
    }
    throw new Error(`unexpected execute: ${q}`);
  }

  async select<T>(query: string, params: unknown[] = []): Promise<T> {
    const q = query.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id, name, body, created_at, updated_at FROM repl_snippets WHERE name')) {
      const [name] = params as [string];
      const found = this.rows.filter((r) => r.name === name);
      return found as unknown as T;
    }
    if (q.startsWith('SELECT id, name, body, created_at, updated_at FROM repl_snippets ORDER BY updated_at DESC')) {
      const sorted = [...this.rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return sorted as unknown as T;
    }
    throw new Error(`unexpected select: ${q}`);
  }
}

describe('snippets-db', () => {
  let db: FakeDb;
  beforeEach(() => { db = new FakeDb(); });

  it('runs CREATE statements on migrate', async () => {
    await migrate(db);
    assert.equal(db.schemaApplied, 2);
  });

  it('inserts a new snippet on first upsertByName', async () => {
    await migrate(db);
    const adapter = createSqlAdapter(db);
    const saved = await adapter.upsertByName('zone-walk', 'await client.zones');
    assert.equal(saved.name, 'zone-walk');
    assert.equal(saved.body, 'await client.zones');
    assert.equal(saved.id, 1);
  });

  it('updates body and updated_at when upserting an existing name', async () => {
    await migrate(db);
    const adapter = createSqlAdapter(db);
    const first = await adapter.upsertByName('zone-walk', 'v1');
    await new Promise((r) => setTimeout(r, 5));
    const second = await adapter.upsertByName('zone-walk', 'v2');
    assert.equal(second.id, first.id);
    assert.equal(second.body, 'v2');
    assert.notEqual(second.updatedAt, first.updatedAt);
  });

  it('lists snippets newest-first by updatedAt', async () => {
    await migrate(db);
    const adapter = createSqlAdapter(db);
    await adapter.upsertByName('a', '1');
    await new Promise((r) => setTimeout(r, 5));
    await adapter.upsertByName('b', '2');
    const all = await adapter.list();
    assert.equal(all.length, 2);
    assert.equal(all[0].name, 'b');
    assert.equal(all[1].name, 'a');
  });

  it('removes by id', async () => {
    await migrate(db);
    const adapter = createSqlAdapter(db);
    const saved = await adapter.upsertByName('to-delete', 'body');
    await adapter.remove(saved.id);
    assert.deepEqual(await adapter.list(), []);
  });

  it('renames by id', async () => {
    await migrate(db);
    const adapter = createSqlAdapter(db);
    const saved = await adapter.upsertByName('old-name', 'body');
    await adapter.rename(saved.id, 'new-name');
    const all = await adapter.list();
    assert.equal(all[0].name, 'new-name');
  });
});
