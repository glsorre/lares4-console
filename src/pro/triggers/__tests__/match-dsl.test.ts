// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in ../LICENSE.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMatch, parseMatch } from '../match-dsl.js';

describe('match-dsl', () => {
  it('parses an empty string to no conditions', () => {
    const parsed = parseMatch('');
    assert.equal(parsed.conditions.length, 0);
    assert.equal(parsed.advanced, '');
  });

  it('parses known chips to conditions and leaves the rest as advanced', () => {
    const parsed = parseMatch('tag:ERROR cmd:LIGHTS foo');
    assert.equal(parsed.conditions.length, 2);
    assert.equal(parsed.conditions[0]!.field, 'tag');
    assert.equal(parsed.conditions[0]!.op, 'is');
    assert.equal(parsed.conditions[0]!.value, 'ERROR');
    assert.equal(parsed.conditions[1]!.field, 'cmd');
    assert.equal(parsed.conditions[1]!.op, 'contains');
    assert.equal(parsed.conditions[1]!.value, 'LIGHTS');
    assert.equal(parsed.advanced, 'foo');
  });

  it('preserves regex / ts / payload tokens in advanced', () => {
    const parsed = parseMatch('/err/i ts>10:00 payload.x~y');
    assert.equal(parsed.conditions.length, 0);
    assert.equal(parsed.advanced, '/err/i ts>10:00 payload.x~y');
  });

  it('round-trips parseMatch → buildMatch', () => {
    const samples = [
      'tag:ERROR',
      'tag:ERROR id:42',
      'tag:ERROR cmd:LIGHTS foo',
      'level:warn source:wire',
      '/err/i ts>10:00',
      '',
    ];
    for (const sample of samples) {
      assert.equal(buildMatch(parseMatch(sample)), sample.trim(), `roundtrip failed for: ${sample}`);
    }
  });

  it('omits conditions with empty values when building', () => {
    const built = buildMatch({
      conditions: [
        { id: '1', field: 'tag', op: 'is', value: 'ACK' },
        { id: '2', field: 'id', op: 'is', value: '' },
      ],
      advanced: '',
    });
    assert.equal(built, 'tag:ACK');
  });

  it('normalises tag to upper-case and level/source to lower-case', () => {
    const built = buildMatch({
      conditions: [
        { id: '1', field: 'tag', op: 'is', value: 'ack' },
        { id: '2', field: 'level', op: 'is', value: 'WARN' },
        { id: '3', field: 'source', op: 'is', value: 'WIRE' },
      ],
      advanced: '',
    });
    assert.equal(built, 'tag:ACK level:warn source:wire');
  });
});
