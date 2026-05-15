import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLogStats } from '../src/core/log-stats.js';
import type { LogEntry } from '../src/core/types.js';

function entry(over: Partial<LogEntry>): LogEntry {
  return {
    ts: '2026-05-13T10:00:00.000Z',
    level: 'info',
    tag: 'LOG',
    message: '',
    ...over,
  };
}

describe('log-stats', () => {
  it('zero entries', () => {
    const s = computeLogStats([]);
    assert.equal(s.totalEvents, 0);
    assert.equal(s.totalErrors, 0);
    assert.equal(s.eventsPerSecond, 0);
  });

  it('tag tallies + errors', () => {
    const items = [
      entry({ tag: 'ACK' }),
      entry({ tag: 'ACK' }),
      entry({ tag: 'ERROR', level: 'error' }),
      entry({ tag: 'CHANGE' }),
    ];
    const s = computeLogStats(items);
    assert.equal(s.totalByTag.ACK, 2);
    assert.equal(s.totalByTag.ERROR, 1);
    assert.equal(s.totalByTag.CHANGE, 1);
    assert.equal(s.totalErrors, 1);
    assert.equal(s.totalEvents, 4);
  });

  it('events/sec rolling window', () => {
    const now = Date.parse('2026-05-13T10:00:10.000Z');
    const items = [
      entry({ ts: '2026-05-13T10:00:00.000Z' }),   // outside 5s
      entry({ ts: '2026-05-13T10:00:06.000Z' }),   // inside 5s window (10-5 = 5)
      entry({ ts: '2026-05-13T10:00:07.500Z' }),
      entry({ ts: '2026-05-13T10:00:09.999Z' }),
    ];
    const s = computeLogStats(items, { windowMs: 5000, nowMs: now });
    // 3 within window over 5s = 0.6/sec
    assert.equal(s.eventsPerSecond, 0.6);
  });

});
