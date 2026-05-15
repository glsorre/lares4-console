import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatConnectionLabel } from '../src/desktop/runtime/connection-label.js';

describe('formatConnectionLabel', () => {
  it('maps known statuses to title-case labels', () => {
    assert.equal(formatConnectionLabel('idle'), 'Idle');
    assert.equal(formatConnectionLabel('connecting'), 'Connecting');
    assert.equal(formatConnectionLabel('online'), 'Online');
    assert.equal(formatConnectionLabel('error'), 'Error');
  });

  it('returns the raw status for unknown values', () => {
    assert.equal(formatConnectionLabel('mystery'), 'mystery');
    assert.equal(formatConnectionLabel(''), '');
  });
});
