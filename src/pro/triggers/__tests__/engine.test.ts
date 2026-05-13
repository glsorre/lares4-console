import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTriggers, validateTriggerMatch, type TriggerRule } from '../engine.js';
import type { LogEntry } from '../../../core/types.js';

function entry(over: Partial<LogEntry>): LogEntry {
  return { ts: '2026-05-13T10:00:00.000Z', level: 'info', tag: 'LOG', message: '', ...over };
}

function rule(over: Partial<TriggerRule>): TriggerRule {
  return {
    id: 'r1',
    name: 'r1',
    enabled: true,
    match: 'tag:ERROR',
    actions: [{ kind: 'highlight', color: 'red' }],
    ...over,
  };
}

describe('triggers', () => {
  it('returns empty evaluation when no rule matches', () => {
    const r = evaluateTriggers(entry({ tag: 'LOG' }), [rule({})]);
    assert.equal(r.matchedRuleIds.length, 0);
    assert.equal(r.highlightColor, undefined);
    assert.equal(r.beep, false);
  });

  it('matches by query DSL and emits highlight', () => {
    const r = evaluateTriggers(entry({ tag: 'ERROR' }), [rule({})]);
    assert.deepEqual(r.matchedRuleIds, ['r1']);
    assert.equal(r.highlightColor, 'red');
  });

  it('skips disabled rules', () => {
    const r = evaluateTriggers(entry({ tag: 'ERROR' }), [rule({ enabled: false })]);
    assert.equal(r.matchedRuleIds.length, 0);
  });

  it('beep action sets beep true', () => {
    const r = evaluateTriggers(
      entry({ tag: 'ERROR' }),
      [rule({ actions: [{ kind: 'beep' }] })],
    );
    assert.equal(r.beep, true);
  });

  it('notify collects rule name + message', () => {
    const r = evaluateTriggers(
      entry({ tag: 'ERROR', message: 'panel offline' }),
      [rule({ actions: [{ kind: 'notify' }] })],
    );
    assert.equal(r.notify.length, 1);
    assert.equal(r.notify[0].message, 'panel offline');
  });

  it('pause action sets pause true', () => {
    const r = evaluateTriggers(
      entry({ tag: 'ERROR' }),
      [rule({ actions: [{ kind: 'pause' }] })],
    );
    assert.equal(r.pause, true);
  });

  it('highest color priority wins', () => {
    const r = evaluateTriggers(
      entry({ tag: 'ERROR' }),
      [
        rule({ id: 'a', match: 'tag:ERROR', actions: [{ kind: 'highlight', color: 'emerald' }] }),
        rule({ id: 'b', match: 'tag:ERROR', actions: [{ kind: 'highlight', color: 'red' }] }),
        rule({ id: 'c', match: 'tag:ERROR', actions: [{ kind: 'highlight', color: 'amber' }] }),
      ],
    );
    assert.equal(r.highlightColor, 'red');
  });

  it('empty match skipped (treated as no rule)', () => {
    const r = evaluateTriggers(
      entry({ tag: 'ERROR' }),
      [rule({ match: '' })],
    );
    assert.equal(r.matchedRuleIds.length, 0);
  });

  it('validateTriggerMatch rejects empty', () => {
    const v = validateTriggerMatch('   ');
    assert.equal(v.ok, false);
  });

  it('validateTriggerMatch accepts valid query', () => {
    const v = validateTriggerMatch('tag:ACK level:error');
    assert.equal(v.ok, true);
  });

  it('validateTriggerMatch rejects unknown tag', () => {
    const v = validateTriggerMatch('tag:NOPE');
    assert.equal(v.ok, false);
  });
});
