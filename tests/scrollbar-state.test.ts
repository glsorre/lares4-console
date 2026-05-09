import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeScrollBarState } from '../src/app/scrollbar-state.js';

describe('scrollbar state normalization', () => {
  it('clamps negative and non-integer values', () => {
    const state = normalizeScrollBarState({
      contentHeight: -5.2,
      viewportHeight: 0.2,
      scrollOffset: -10.9,
    });
    assert.deepEqual(state, {
      contentHeight: 0,
      viewportHeight: 1,
      scrollOffset: 0,
    });
  });

  it('clamps scroll offset to bottom boundary', () => {
    const state = normalizeScrollBarState({
      contentHeight: 100,
      viewportHeight: 20,
      scrollOffset: 200,
    });
    assert.equal(state.scrollOffset, 80);
  });

  it('keeps valid values unchanged (after flooring)', () => {
    const state = normalizeScrollBarState({
      contentHeight: 51.9,
      viewportHeight: 10.9,
      scrollOffset: 12.7,
    });
    assert.deepEqual(state, {
      contentHeight: 51,
      viewportHeight: 10,
      scrollOffset: 12,
    });
  });
});

