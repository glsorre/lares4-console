// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cutoffIso, purgeStale, RETENTION_DAYS } from '../retention.js';
import type { SessionsAdapter } from '../db.js';

function fakeAdapter(): { adapter: SessionsAdapter; cutoffs: string[] } {
  const cutoffs: string[] = [];
  return {
    cutoffs,
    adapter: {
      async createSession() { return 1; },
      async appendEntries() { /* no-op */ },
      async finalizeSession() { /* no-op */ },
      async listSessions() { return []; },
      async loadSession() { return null; },
      async loadSessionEntries() { return []; },
      async deleteSession() { /* no-op */ },
      async purgeOlderThan(iso) { cutoffs.push(iso); },
    },
  };
}

describe('sessions/retention', () => {
  it('cutoffIso defaults to 30 days back', () => {
    const now = Date.UTC(2026, 4, 15, 12, 0, 0); // 2026-05-15T12:00:00Z
    const iso = cutoffIso(now);
    assert.equal(iso, '2026-04-15T12:00:00.000Z');
    assert.equal(RETENTION_DAYS, 30);
  });

  it('purgeStale invokes adapter with computed cutoff', async () => {
    const { adapter, cutoffs } = fakeAdapter();
    const now = Date.UTC(2026, 4, 15, 0, 0, 0);
    await purgeStale(adapter, now, 7);
    assert.equal(cutoffs.length, 1);
    assert.equal(cutoffs[0], '2026-05-08T00:00:00.000Z');
  });
});
