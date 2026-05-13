import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addChip,
  applyLogQuery,
  compileChipFilters,
  compileLogQuery,
  extractFreeTextTerms,
  joinQuery,
  removeChipFromInput,
  splitQuery,
} from '../src/core/log-query.js';
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

  it('source: filters by entry origin', () => {
    const items = [
      entry({ source: 'wire', tag: 'RAW_RX', message: 'a' }),
      entry({ source: 'command', tag: 'ACK', message: 'b' }),
      entry({ source: 'lifecycle', tag: 'LOG', message: 'c' }),
    ];
    const r = applyLogQuery(items, 'source:wire');
    assert.equal(r.length, 1);
    assert.equal(r[0].message, 'a');
  });

  it('source: is case-insensitive', () => {
    const items = [entry({ source: 'wire' }), entry({ source: 'command' })];
    assert.equal(applyLogQuery(items, 'source:WIRE').length, 1);
  });

  it('source: with unknown value reports error', () => {
    const q = compileLogQuery('source:nope');
    assert.ok(q.error);
  });

  it('source: defaults missing source to lifecycle', () => {
    const items = [entry({}), entry({ source: 'wire' })];
    const r = applyLogQuery(items, 'source:lifecycle');
    assert.equal(r.length, 1);
  });

  it('source AND tag composes', () => {
    const items = [
      entry({ source: 'wire', tag: 'ACK' }),
      entry({ source: 'wire', tag: 'CHANGE' }),
      entry({ source: 'command', tag: 'ACK' }),
    ];
    const r = applyLogQuery(items, 'source:wire tag:ACK');
    assert.equal(r.length, 1);
  });
});

describe('log-query chip helpers', () => {
  it('splitQuery extracts known chip-shape tokens', () => {
    const split = splitQuery('hello source:wire tag:ACK timeout id:42 noise');
    assert.deepEqual(split.chips.map((c) => c.raw), ['source:wire', 'tag:ACK', 'id:42']);
    assert.equal(split.trailing, 'hello timeout noise');
  });

  it('splitQuery normalizes case in chip values', () => {
    const split = splitQuery('tag:ack source:WIRE level:Error');
    assert.deepEqual(split.chips.map((c) => c.raw), ['tag:ACK', 'source:wire', 'level:error']);
  });

  it('splitQuery deduplicates equivalent chips', () => {
    const split = splitQuery('tag:ACK tag:ack');
    assert.equal(split.chips.length, 1);
  });

  it('splitQuery treats unknown values as free text', () => {
    const split = splitQuery('tag:NOPE source:fake');
    assert.deepEqual(split.chips, []);
    assert.equal(split.trailing, 'tag:NOPE source:fake');
  });

  it('joinQuery reassembles chips + trailing', () => {
    const out = joinQuery({
      chips: [
        { kind: 'source', value: 'wire',    raw: 'source:wire' },
        { kind: 'tag',    value: 'ACK',     raw: 'tag:ACK' },
      ],
      trailing: 'foo bar',
    });
    assert.equal(out, 'source:wire tag:ACK foo bar');
  });

  it('addChip appends and dedupes', () => {
    const a = addChip('foo', { kind: 'tag', value: 'ACK', raw: 'tag:ACK' });
    assert.equal(a, 'tag:ACK foo');
    const b = addChip(a, { kind: 'tag', value: 'ACK', raw: 'tag:ACK' });
    assert.equal(b, 'tag:ACK foo');
  });

  it('removeChipFromInput strips by raw form', () => {
    const next = removeChipFromInput('source:wire tag:ACK rest', 'source:wire');
    assert.equal(next, 'tag:ACK rest');
  });
});

describe('log-query split filter vs search', () => {
  it('compileChipFilters applies only chip predicates', () => {
    const items = [
      entry({ tag: 'ACK', level: 'error', message: 'timeout reached' }),
      entry({ tag: 'ACK', level: 'info', message: 'timeout reached' }),
      entry({ tag: 'LOG', level: 'error', message: 'timeout reached' }),
    ];
    const q = compileChipFilters('tag:ACK level:error');
    const r = items.filter(q.predicate);
    assert.equal(q.isEmpty, false);
    assert.equal(r.length, 1);
    assert.equal(r[0].tag, 'ACK');
    assert.equal(r[0].level, 'error');
  });

  it('compileChipFilters ignores free-text trailing', () => {
    const items = [
      entry({ tag: 'ACK', message: 'no match here' }),
      entry({ tag: 'LOG', message: 'timeout reached' }),
    ];
    const q = compileChipFilters('tag:ACK timeout');
    const r = items.filter(q.predicate);
    assert.equal(r.length, 1);
    assert.equal(r[0].tag, 'ACK');
  });

  it('compileChipFilters is empty when no chips', () => {
    const q = compileChipFilters('foo bar');
    assert.equal(q.isEmpty, true);
    assert.equal(q.predicate(entry({ message: 'anything' })), true);
  });

  it('extractFreeTextTerms returns trailing terms only', () => {
    const terms = extractFreeTextTerms('tag:ACK level:error timeout cmd:lights leftover');
    assert.deepEqual(terms.sort(), ['leftover', 'timeout']);
  });

  it('extractFreeTextTerms drops partial chip fragments', () => {
    assert.deepEqual(extractFreeTextTerms('tag:ACK source:'), []);
    assert.deepEqual(extractFreeTextTerms('level:'), []);
  });

  it('extractFreeTextTerms lowercases and strips quotes', () => {
    const terms = extractFreeTextTerms('tag:ACK "Hello World" FOO');
    assert.deepEqual(terms.sort(), ['foo', 'hello world']);
  });
});
