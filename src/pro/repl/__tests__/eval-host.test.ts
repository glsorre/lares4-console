// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in src/pro/repl.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LogStore } from '@/core/log-store.js';
import { ReplEvalHost } from '../eval-host.js';
import type { ReplEntry } from '../types.js';

/** Web Workers are not available in the node:test runner. These tests cover the host's
 *  observable API surface (busy state, dispose lifecycle, empty-input no-op) without
 *  spawning a real worker — the worker round-trip is covered manually via the dev build
 *  (see plan verification step). */
describe('ReplEvalHost', () => {
  function makeHost(): { host: ReplEvalHost; entries: ReplEntry[] } {
    const store = new LogStore();
    const entries: ReplEntry[] = [];
    const host = new ReplEvalHost({
      getLares: () => undefined,
      getLogStore: () => store,
      appendEntry: (entry) => entries.push(entry),
      // Throw if anything tries to spawn — these tests never get past empty input.
      spawnWorker: () => { throw new Error('spawnWorker should not be called in this test'); },
    });
    return { host, entries };
  }

  it('isBusy is false on a fresh host', () => {
    const { host } = makeHost();
    assert.equal(host.isBusy(), false);
    host.dispose();
  });

  it('run() with empty input is a no-op (does not spawn worker)', async () => {
    const { host, entries } = makeHost();
    await host.run('   \n  ');
    assert.deepEqual(entries, []);
    host.dispose();
  });

  it('stop() and dispose() are idempotent when no worker has been spawned', () => {
    const { host } = makeHost();
    host.stop();
    host.stop();
    host.dispose();
    host.dispose();
    assert.equal(host.isBusy(), false);
  });

  it('subscribeBusy returns an unsubscribe function', () => {
    const { host } = makeHost();
    let notified = 0;
    const unsubscribe = host.subscribeBusy(() => { notified += 1; });
    assert.equal(typeof unsubscribe, 'function');
    unsubscribe();
    // Subsequent stop() must not notify after unsubscribe.
    host.stop();
    assert.equal(notified, 0);
    host.dispose();
  });
});
