import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  isReadOnlyMode,
  setReadOnlyMode,
  subscribeReadOnlyMode,
} from '../src/desktop/runtime/read-only-prefs.js';

describe('read-only prefs', () => {
  beforeEach(() => {
    // dom-setup.ts registers happy-dom globally so window.localStorage is available.
    window.localStorage.removeItem('lares4.readOnlyMode');
  });

  it('defaults to false when nothing is stored', () => {
    assert.equal(isReadOnlyMode(), false);
  });

  it('persists true to localStorage as "1"', () => {
    setReadOnlyMode(true);
    assert.equal(window.localStorage.getItem('lares4.readOnlyMode'), '1');
    assert.equal(isReadOnlyMode(), true);
  });

  it('removes the storage key when set to false', () => {
    setReadOnlyMode(true);
    setReadOnlyMode(false);
    assert.equal(window.localStorage.getItem('lares4.readOnlyMode'), null);
    assert.equal(isReadOnlyMode(), false);
  });

  it('notifies subscribers on change and unsubscribes cleanly', () => {
    const calls: boolean[] = [];
    const unsubscribe = subscribeReadOnlyMode((value) => calls.push(value));
    setReadOnlyMode(true);
    setReadOnlyMode(false);
    unsubscribe();
    setReadOnlyMode(true);
    assert.deepEqual(calls, [true, false]);
  });
});
