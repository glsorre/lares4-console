import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopology } from '../src/core/topology.js';

describe('topology', () => {
  it('returns empty snapshot for undefined', () => {
    const s = buildTopology(undefined);
    assert.equal(s.total, 0);
    assert.equal(s.groups.length, 0);
  });

  it('builds zones group with armed/disarmed status', () => {
    const s = buildTopology({
      zones: [
        { ID: 1, DES: 'Front door', STA: 'ARMED' },
        { ID: 2, DES: 'Kitchen', STA: 'DISARMED' },
        { ID: 3, DES: 'Garage', STA: 'ALARM' },
      ],
    });
    assert.equal(s.groups.length, 1);
    const g = s.groups[0];
    assert.equal(g.kind, 'zones');
    assert.equal(g.count, 3);
    assert.equal(g.nodes[0].status, 'armed');
    assert.equal(g.nodes[1].status, 'disarmed');
    assert.equal(g.nodes[2].status, 'alarm');
    assert.equal(g.nodes[0].label, 'Front door');
  });

  it('lights ON/OFF status derived', () => {
    const s = buildTopology({
      lights: [
        { ID: 1, name: 'Living', state: 'ON' },
        { ID: 2, name: 'Bedroom', state: 'OFF' },
        { ID: 3, name: 'Hall', state: 50 },
      ],
    });
    const g = s.groups[0];
    assert.equal(g.nodes[0].status, 'on');
    assert.equal(g.nodes[1].status, 'off');
    assert.equal(g.nodes[2].status, 'on');
  });

  it('covers and gates open/closed', () => {
    const s = buildTopology({
      covers: [{ ID: 1, STA: 'UP' }, { ID: 2, STA: 'DOWN' }],
      gates: [{ ID: 5, STA: 'OPEN' }],
    });
    assert.equal(s.groups.length, 2);
    const covers = s.groups.find((g) => g.kind === 'covers')!;
    const gates = s.groups.find((g) => g.kind === 'gates')!;
    assert.equal(covers.nodes[0].status, 'open');
    assert.equal(covers.nodes[1].status, 'closed');
    assert.equal(gates.nodes[0].status, 'open');
  });

  it('numeric ID sorting', () => {
    const s = buildTopology({
      lights: [{ ID: 10, STA: 'ON' }, { ID: 2, STA: 'ON' }, { ID: 1, STA: 'ON' }],
    });
    const ids = s.groups[0].nodes.map((n) => n.id);
    assert.deepEqual(ids, ['1', '2', '10']);
  });

  it('skips items without an ID', () => {
    const s = buildTopology({ lights: [{ STA: 'ON' }, { ID: 1, STA: 'ON' }] });
    assert.equal(s.groups[0].count, 1);
  });

  it('groups ordered alphabetically by label', () => {
    const s = buildTopology({
      lights: [{ ID: 1, STA: 'ON' }],
      zones: [{ ID: 1, STA: 'ARMED' }],
      thermostats: [{ ID: 1, STA: 'HEAT' }],
    });
    const kinds = s.groups.map((g) => g.kind);
    assert.deepEqual(kinds, ['lights', 'thermostats', 'zones']);
  });

  it('handles object source (not array)', () => {
    const s = buildTopology({
      lights: { a: { ID: 1, STA: 'ON' }, b: { ID: 2, STA: 'OFF' } },
    });
    assert.equal(s.groups[0].count, 2);
  });
});
