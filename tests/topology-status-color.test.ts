import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { statusColorVar } from '../src/desktop/runtime/topology-status-color.js';
import type { TopologyNode } from '../src/core/topology.js';

const FALLBACK = 'color-mix(in oklch, var(--muted-foreground) 50%, transparent)';

describe('statusColorVar', () => {
  it('returns specific colors for known active statuses', () => {
    assert.match(statusColorVar('on'), /^oklch\(/);
    assert.match(statusColorVar('open'), /^oklch\(/);
    assert.match(statusColorVar('armed'), /^oklch\(/);
    assert.match(statusColorVar('bypassed'), /^oklch\(/);
  });

  it('uses the same red for alarm and error', () => {
    assert.equal(statusColorVar('alarm'), statusColorVar('error'));
  });

  it('falls back to muted for off/closed/disarmed/unknown', () => {
    for (const status of ['off', 'closed', 'disarmed', 'unknown'] as TopologyNode['status'][]) {
      assert.equal(statusColorVar(status), FALLBACK);
    }
  });
});
