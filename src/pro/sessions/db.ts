// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import type { LogEntry, LogLevel, LogSource, LogTag } from '@/core/types.js';

export interface SessionMeta {
  startedAt: string;
  profileName?: string;
  sender?: string;
  format?: string;
  events?: string;
}

export interface PersistedSession {
  id: number;
  startedAt: string;
  endedAt: string | null;
  profileName: string | null;
  sender: string | null;
  format: string | null;
  events: string | null;
  logCount: number;
}

export interface SessionsAdapter {
  createSession(meta: SessionMeta): Promise<number>;
  appendEntries(sessionId: number, entries: LogEntry[], startSeq: number): Promise<void>;
  finalizeSession(sessionId: number, endedAt: string, logCount: number): Promise<void>;
  listSessions(limit?: number): Promise<PersistedSession[]>;
  loadSession(sessionId: number): Promise<PersistedSession | null>;
  loadSessionEntries(sessionId: number): Promise<LogEntry[]>;
  deleteSession(sessionId: number): Promise<void>;
  purgeOlderThan(isoDate: string): Promise<void>;
}

interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

const MIGRATION_SQL = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    profile_name TEXT,
    sender TEXT,
    format TEXT,
    events TEXT,
    log_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS log_entries (
    session_id INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    ts TEXT NOT NULL,
    level TEXT NOT NULL,
    tag TEXT NOT NULL,
    source TEXT,
    entry_id TEXT,
    message TEXT NOT NULL,
    command TEXT,
    group_id TEXT,
    correlation_id TEXT,
    latency_ms INTEGER,
    highlight TEXT,
    payload_json TEXT,
    folded_json TEXT,
    ack_json TEXT,
    wire_json TEXT,
    PRIMARY KEY (session_id, seq),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_log_entries_session_id ON log_entries(session_id)`,
];

interface SessionRow {
  id: number;
  started_at: string;
  ended_at: string | null;
  profile_name: string | null;
  sender: string | null;
  format: string | null;
  events: string | null;
  log_count: number;
}

interface EntryRow {
  seq: number;
  ts: string;
  level: string;
  tag: string;
  source: string | null;
  entry_id: string | null;
  message: string;
  command: string | null;
  group_id: string | null;
  correlation_id: string | null;
  latency_ms: number | null;
  highlight: string | null;
  payload_json: string | null;
  folded_json: string | null;
  ack_json: string | null;
  wire_json: string | null;
}

function rowToSession(row: SessionRow): PersistedSession {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    profileName: row.profile_name,
    sender: row.sender,
    format: row.format,
    events: row.events,
    logCount: row.log_count,
  };
}

function parseJson(value: string | null): unknown {
  if (value === null || value.length === 0) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function rowToEntry(row: EntryRow): LogEntry {
  const folded = parseJson(row.folded_json) as LogEntry['folded'] | undefined;
  const ack = parseJson(row.ack_json) as LogEntry['ack'] | undefined;
  const wire = parseJson(row.wire_json) as LogEntry['wireFrame'] | undefined;
  const entry: LogEntry = {
    ts: row.ts,
    level: row.level as LogLevel,
    tag: row.tag as LogTag,
    message: row.message,
  };
  if (row.source !== null) entry.source = row.source as LogSource;
  if (row.entry_id !== null) entry.entryId = row.entry_id;
  if (row.command !== null) entry.command = row.command;
  if (row.group_id !== null) entry.groupId = row.group_id;
  if (row.correlation_id !== null) entry.correlationId = row.correlation_id;
  if (row.latency_ms !== null) entry.latencyMs = row.latency_ms;
  if (row.highlight !== null) entry.highlight = row.highlight as LogEntry['highlight'];
  const payload = parseJson(row.payload_json);
  if (payload !== undefined) entry.payload = payload;
  if (folded !== undefined) entry.folded = folded;
  if (ack !== undefined) entry.ack = ack;
  if (wire !== undefined) entry.wireFrame = wire;
  return entry;
}

export function createSqlAdapter(db: SqlDatabase): SessionsAdapter {
  return {
    async createSession(meta) {
      const result = await db.execute(
        `INSERT INTO sessions (started_at, profile_name, sender, format, events) VALUES (?, ?, ?, ?, ?)`,
        [meta.startedAt, meta.profileName ?? null, meta.sender ?? null, meta.format ?? null, meta.events ?? null],
      );
      if (result.lastInsertId === undefined) {
        throw new Error('createSession: missing lastInsertId');
      }
      return result.lastInsertId;
    },
    async appendEntries(sessionId, entries, startSeq) {
      if (entries.length === 0) return;
      for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i];
        await db.execute(
          `INSERT OR IGNORE INTO log_entries (
            session_id, seq, ts, level, tag, source, entry_id, message, command, group_id,
            correlation_id, latency_ms, highlight, payload_json, folded_json, ack_json, wire_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            startSeq + i,
            e.ts,
            e.level,
            e.tag,
            e.source ?? null,
            e.entryId ?? null,
            e.message,
            e.command ?? null,
            e.groupId ?? null,
            e.correlationId ?? null,
            e.latencyMs ?? null,
            e.highlight ?? null,
            e.payload !== undefined ? JSON.stringify(e.payload) : null,
            e.folded !== undefined ? JSON.stringify(e.folded) : null,
            e.ack !== undefined ? JSON.stringify(e.ack) : null,
            e.wireFrame !== undefined ? JSON.stringify(e.wireFrame) : null,
          ],
        );
      }
    },
    async finalizeSession(sessionId, endedAt, logCount) {
      await db.execute(
        `UPDATE sessions SET ended_at = ?, log_count = ? WHERE id = ?`,
        [endedAt, logCount, sessionId],
      );
    },
    async listSessions(limit = 100) {
      const rows = await db.select<SessionRow[]>(
        `SELECT id, started_at, ended_at, profile_name, sender, format, events, log_count
         FROM sessions ORDER BY started_at DESC LIMIT ?`,
        [limit],
      );
      return rows.map(rowToSession);
    },
    async loadSession(sessionId) {
      const rows = await db.select<SessionRow[]>(
        `SELECT id, started_at, ended_at, profile_name, sender, format, events, log_count
         FROM sessions WHERE id = ?`,
        [sessionId],
      );
      if (rows.length === 0) return null;
      return rowToSession(rows[0]);
    },
    async loadSessionEntries(sessionId) {
      const rows = await db.select<EntryRow[]>(
        `SELECT seq, ts, level, tag, source, entry_id, message, command, group_id,
                correlation_id, latency_ms, highlight, payload_json, folded_json, ack_json, wire_json
         FROM log_entries WHERE session_id = ? ORDER BY seq ASC`,
        [sessionId],
      );
      return rows.map(rowToEntry);
    },
    async deleteSession(sessionId) {
      await db.execute(`DELETE FROM log_entries WHERE session_id = ?`, [sessionId]);
      await db.execute(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
    },
    async purgeOlderThan(isoDate) {
      const stale = await db.select<{ id: number }[]>(
        `SELECT id FROM sessions WHERE started_at < ?`,
        [isoDate],
      );
      for (const { id } of stale) {
        await db.execute(`DELETE FROM log_entries WHERE session_id = ?`, [id]);
      }
      await db.execute(`DELETE FROM sessions WHERE started_at < ?`, [isoDate]);
    },
  };
}

export async function migrate(db: SqlDatabase): Promise<void> {
  for (const stmt of MIGRATION_SQL) {
    await db.execute(stmt);
  }
}

const DB_URL = 'sqlite:sessions.db';

let cached: Promise<SessionsAdapter> | null = null;

interface PluginSqlModule {
  default: { load(url: string): Promise<SqlDatabase> };
}

export function loadAdapter(): Promise<SessionsAdapter> {
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
