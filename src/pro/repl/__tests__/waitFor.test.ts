// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in src/pro/repl.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LogStore } from '@/core/log-store.js';
import { createWaitForHandler } from '../eval-host.js';

describe('createWaitForHandler', () => {
  it('resolves with the first entry that matches the predicate', async () => {
    const store = new LogStore();
    const waitFor = createWaitForHandler(() => store);
    const pending = waitFor("(e) => e.tag === 'CHANGE'", 1000);
    store.push({ level: 'info', tag: 'RAW_RX', source: 'wire', message: 'noise' });
    store.push({ level: 'info', tag: 'CHANGE', source: 'lifecycle', message: 'zone armed' });
    const matched = await pending;
    assert.equal(matched.tag, 'CHANGE');
    assert.equal(matched.message, 'zone armed');
  });

  it('rejects with a timeout error when no entry matches in the window', async () => {
    const store = new LogStore();
    const waitFor = createWaitForHandler(() => store);
    const start = Date.now();
    await assert.rejects(
      waitFor("(e) => e.tag === 'BULK'", 30),
      /timeout/,
    );
    assert.ok(Date.now() - start >= 25, 'should have waited at least ~timeout ms');
  });

  it('swallows predicate errors and continues until a real match', async () => {
    const store = new LogStore();
    const waitFor = createWaitForHandler(() => store);
    // First entry has no payload, so `e.payload.deep` throws; the handler must swallow it
    // and keep listening so the second entry (carrying the deep property) matches.
    const pending = waitFor("(e) => e.payload.deep === 'yes'", 200);
    store.push({ level: 'info', tag: 'SYSTEM', source: 'lifecycle', message: 'noisy' });
    store.push({ level: 'info', tag: 'SYSTEM', source: 'lifecycle', message: 'good', payload: { deep: 'yes' } });
    const matched = await pending;
    assert.equal(matched.message, 'good');
  });

  it('rejects when the matcher source is not a function expression', async () => {
    const store = new LogStore();
    const waitFor = createWaitForHandler(() => store);
    await assert.rejects(
      waitFor('42', 100),
      /matcher is not a function/,
    );
  });
});
