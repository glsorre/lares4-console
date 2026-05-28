// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.
//
// Persistent named snippets, keyed on a unique `name`. Piggybacks on the
// pro SQLite DB (the file already opened by `pro/sessions/db.ts`) so users
// don't need a second database.

import { nowIso } from '@/core/utils.js';
import type { Snippet, SnippetsAdapter } from './types.js';

interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

const MIGRATION_SQL = [
  `CREATE TABLE IF NOT EXISTS repl_snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_repl_snippets_name ON repl_snippets(name)`,
];

interface SnippetRow {
  id: number;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function rowToSnippet(row: SnippetRow): Snippet {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function migrate(db: SqlDatabase): Promise<void> {
  for (const stmt of MIGRATION_SQL) {
    await db.execute(stmt);
  }
}

export function createSqlAdapter(db: SqlDatabase): SnippetsAdapter {
  return {
    async list() {
      const rows = await db.select<SnippetRow[]>(
        `SELECT id, name, body, created_at, updated_at FROM repl_snippets ORDER BY updated_at DESC`,
      );
      return rows.map(rowToSnippet);
    },
    async upsertByName(name, body) {
      const ts = nowIso();
      const existing = await db.select<SnippetRow[]>(
        `SELECT id, name, body, created_at, updated_at FROM repl_snippets WHERE name = ?`,
        [name],
      );
      if (existing.length === 0) {
        const inserted = await db.execute(
          `INSERT INTO repl_snippets (name, body, created_at, updated_at) VALUES (?, ?, ?, ?)`,
          [name, body, ts, ts],
        );
        if (inserted.lastInsertId === undefined) {
          throw new Error('upsertByName: missing lastInsertId');
        }
        return { id: inserted.lastInsertId, name, body, createdAt: ts, updatedAt: ts };
      }
      const row = existing[0];
      await db.execute(
        `UPDATE repl_snippets SET body = ?, updated_at = ? WHERE id = ?`,
        [body, ts, row.id],
      );
      return { id: row.id, name: row.name, body, createdAt: row.created_at, updatedAt: ts };
    },
    async rename(id, name) {
      await db.execute(
        `UPDATE repl_snippets SET name = ?, updated_at = ? WHERE id = ?`,
        [name, nowIso(), id],
      );
    },
    async remove(id) {
      await db.execute(`DELETE FROM repl_snippets WHERE id = ?`, [id]);
    },
  };
}

const DB_URL = 'sqlite:sessions.db';

let cached: Promise<SnippetsAdapter> | null = null;

interface PluginSqlModule {
  default: { load(url: string): Promise<SqlDatabase> };
}

export function loadSnippetsAdapter(): Promise<SnippetsAdapter> {
  if (cached === null) {
    cached = (async () => {
      const mod = (await import(/* @vite-ignore */ '@tauri-apps/plugin-sql')) as unknown as PluginSqlModule;
      const db = await mod.default.load(DB_URL);
      await migrate(db);
      return createSqlAdapter(db);
    })();
  }
  return cached;
}

export function __resetAdapterCacheForTests(): void {
  cached = null;
}
