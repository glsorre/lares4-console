import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyLogQuery, compileLogQuery } from '../src/core/log-query.js';
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

describe('log-query', () => {
  it('empty query passes all', () => {
    const q = compileLogQuery('');
    assert.equal(q.isEmpty, true);
    assert.equal(q.predicate(entry({ message: 'x' })), true);
  });

  it('free text matches message case-insensitively', () => {
    const r = applyLogQuery([entry({ message: 'Timeout reached' }), entry({ message: 'ok' })], 'timeout');
    assert.equal(r.length, 1);
    assert.equal(r[0].message, 'Timeout reached');
  });

  it('tag: filter', () => {
    const items = [entry({ tag: 'ACK' }), entry({ tag: 'ERROR' })];
    const r = applyLogQuery(items, 'tag:ACK');
    assert.equal(r.length, 1);
    assert.equal(r[0].tag, 'ACK');
  });

  it('level: filter', () => {
    const items = [entry({ level: 'error', tag: 'ERROR' }), entry({ level: 'info', tag: 'LOG' })];
    const r = applyLogQuery(items, 'level:error');
    assert.equal(r.length, 1);
  });

  it('id: searches deep payload', () => {
    const e = entry({ payload: { CMD: 'LIGHTS', PAYLOAD: { LIGHTS: [{ ID: 42, STA: 'ON' }] } } });
    const e2 = entry({ payload: { CMD: 'COVERS', PAYLOAD: { COVERS: [{ ID: 7, STA: 'UP' }] } } });
    const r = applyLogQuery([e, e2], 'id:42');
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].payload, e.payload);
  });

  it('cmd: matches payload CMD', () => {
    const e1 = entry({ payload: { CMD: 'LIGHTS' } });
    const e2 = entry({ payload: { CMD: 'COVERS' } });
    const r = applyLogQuery([e1, e2], 'cmd:lights');
    assert.equal(r.length, 1);
  });

  it('payload.X.Y~value substring match', () => {
    const e1 = entry({ payload: { PAYLOAD: { RESULT_DETAIL: 'timeout-3000' } } });
    const e2 = entry({ payload: { PAYLOAD: { RESULT_DETAIL: 'OK' } } });
    const r = applyLogQuery([e1, e2], 'payload.PAYLOAD.RESULT_DETAIL~timeout');
    assert.equal(r.length, 1);
  });

  it('payload.X=exact equality', () => {
    const e1 = entry({ payload: { PAYLOAD: { RESULT: 'OK' } } });
    const e2 = entry({ payload: { PAYLOAD: { RESULT: 'OKAY' } } });
    const r = applyLogQuery([e1, e2], 'payload.PAYLOAD.RESULT=OK');
    assert.equal(r.length, 1);
  });

  it('ts> filter', () => {
    const a = entry({ ts: new Date(2026, 4, 13, 10, 0, 0).toISOString() });
    const b = entry({ ts: new Date(2026, 4, 13, 12, 30, 0).toISOString() });
    const r = applyLogQuery([a, b], 'ts>11:00');
    assert.equal(r.length, 1);
  });

  it('regex /pattern/ matches', () => {
    const a = entry({ message: 'foo-123' });
    const b = entry({ message: 'bar' });
    const r = applyLogQuery([a, b], '/foo-\\d+/');
    assert.equal(r.length, 1);
  });

  it('AND across multiple tokens', () => {
    const items = [
      entry({ tag: 'ACK', level: 'error', message: 'timeout' }),
      entry({ tag: 'ACK', level: 'info', message: 'timeout' }),
      entry({ tag: 'LOG', level: 'error', message: 'timeout' }),
    ];
    const r = applyLogQuery(items, 'tag:ACK level:error');
    assert.equal(r.length, 1);
  });

  it('quoted free-text preserves spaces', () => {
    const items = [
      entry({ message: 'hello world' }),
      entry({ message: 'helloworld' }),
    ];
    const r = applyLogQuery(items, '"hello world"');
    assert.equal(r.length, 1);
  });

  it('invalid tag reports error and skips', () => {
    const q = compileLogQuery('tag:NOPE');
    assert.ok(q.error);
  });

  it('exposes freeTextTerms for highlighting', () => {
    const q = compileLogQuery('foo tag:ACK bar');
    assert.deepEqual(q.freeTextTerms.sort(), ['bar', 'foo']);
  });
});
