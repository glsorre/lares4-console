import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LogStore } from '../src/core/log-store.js';

describe('LogStore', () => {
  it('pushes entries in order and increments version', () => {
    const store = new LogStore(100);
    assert.equal(store.version(), 0);
    store.push({ level: 'info', tag: 'SYSTEM', message: 'a' });
    store.push({ level: 'info', tag: 'SYSTEM', message: 'b' });
    assert.equal(store.version(), 2);
    const entries = store.all();
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.message, 'a');
    assert.equal(entries[1]?.message, 'b');
    assert.ok(entries[0]?.ts);
  });

  it('drops oldest when over maxSize', () => {
    const store = new LogStore(2);
    store.push({ level: 'info', tag: 'SYSTEM', message: '1' });
    store.push({ level: 'info', tag: 'SYSTEM', message: '2' });
    store.push({ level: 'info', tag: 'SYSTEM', message: '3' });
    assert.deepEqual(store.all().map((e) => e.message), ['2', '3']);
  });

  it('clear empties and bumps version', () => {
    const store = new LogStore();
    store.push({ level: 'info', tag: 'SYSTEM', message: 'x' });
    store.clear();
    assert.equal(store.all().length, 0);
    assert.ok(store.version() >= 2);
  });

  it('redacts PIN-like substrings in messages', () => {
    const store = new LogStore();
    store.push({ level: 'info', tag: 'LOG', message: 'pin=secret123' });
    assert.equal(store.all()[0]?.message, 'pin=***');
  });

  it('assigns a stable monotonically-increasing entryId when none provided', () => {
    const store = new LogStore();
    store.push({ level: 'info', tag: 'SYSTEM', message: 'a' });
    store.push({ level: 'info', tag: 'SYSTEM', message: 'b' });
    const ids = store.all().map((e) => e.entryId);
    assert.ok(ids[0] && ids[1]);
    assert.notEqual(ids[0], ids[1]);
  });

  it('preserves a caller-supplied entryId (replay round-trip)', () => {
    const store = new LogStore();
    store.push({ level: 'info', tag: 'SYSTEM', message: 'a', entryId: 'caller-1' });
    assert.equal(store.all()[0]?.entryId, 'caller-1');
  });
});
