import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adaptLares4Topology } from '../src/desktop/runtime/topology-adapter.js';
import { buildTopology } from '../src/core/topology.js';

describe('topology-adapter', () => {
  it('returns empty input for null snapshot', () => {
    const result = adaptLares4Topology(null);
    assert.deepEqual(result, {});
  });

  it('maps lights on/off via boolean', () => {
    const input = adaptLares4Topology({
      lights: [
        { id: 1, description: 'Kitchen', on: true, brightness: 80 },
        { id: 2, description: 'Hall', on: false },
      ],
    });
    const topology = buildTopology(input);
    const lights = topology.groups.find((g) => g.kind === 'lights');
    assert.ok(lights);
    assert.equal(lights.nodes[0].status, 'on');
    assert.equal(lights.nodes[0].label, 'Kitchen');
    assert.equal(lights.nodes[1].status, 'off');
  });

  it('maps covers stopped/opening/closing with position', () => {
    const input = adaptLares4Topology({
      covers: [
        { id: 1, description: 'Living', state: 'stopped', position: 65 },
        { id: 2, description: 'Bedroom', state: 'stopped', position: 0 },
        { id: 3, description: 'Studio', state: 'opening', position: 40 },
        { id: 4, description: 'Bathroom', state: 'closing', position: 20 },
        { id: 5, description: 'Garage', state: 'stopped' },
      ],
    });
    const topology = buildTopology(input);
    const covers = topology.groups.find((g) => g.kind === 'covers');
    assert.ok(covers);
    assert.equal(covers.nodes[0].status, 'open');
    assert.match(covers.nodes[0].state ?? '', /OPEN 65%/);
    assert.equal(covers.nodes[1].status, 'closed');
    assert.equal(covers.nodes[2].status, 'open'); // opening → "OPEN ↑ 40%"
    assert.match(covers.nodes[2].state ?? '', /↑/);
    assert.equal(covers.nodes[3].status, 'closed'); // closing → "CLOSED ↓ 20%"
    assert.match(covers.nodes[3].state ?? '', /↓/);
    assert.equal(covers.nodes[4].status, 'unknown'); // STOPPED without position
  });

  it('maps gates on→open / off→closed', () => {
    const input = adaptLares4Topology({
      gates: [
        { id: 1, description: 'Main', on: true },
        { id: 2, description: 'Side', on: false },
      ],
    });
    const topology = buildTopology(input);
    const gates = topology.groups.find((g) => g.kind === 'gates');
    assert.ok(gates);
    assert.equal(gates.nodes[0].status, 'open');
    assert.equal(gates.nodes[1].status, 'closed');
  });

  it('maps switches on/off', () => {
    const input = adaptLares4Topology({
      switches: [
        { id: 1, description: 'Pump', on: true },
        { id: 2, description: 'Heater', on: false },
      ],
    });
    const topology = buildTopology(input);
    const switches = topology.groups.find((g) => g.kind === 'switches');
    assert.ok(switches);
    assert.equal(switches.nodes[0].status, 'on');
    assert.equal(switches.nodes[1].status, 'off');
  });

  it('maps zone armed/disarmed/bypassed/fault priorities', () => {
    const input = adaptLares4Topology({
      zones: [
        { id: 1, description: 'Front', armed: true, bypassed: false, fault: false, open: false },
        { id: 2, description: 'Back', armed: false, bypassed: false, fault: false, open: false },
        { id: 3, description: 'Garage', armed: true, bypassed: true, fault: false, open: false },
        { id: 4, description: 'Window', armed: false, bypassed: false, fault: true, open: false },
      ],
    });
    const topology = buildTopology(input);
    const zones = topology.groups.find((g) => g.kind === 'zones');
    assert.ok(zones);
    assert.equal(zones.nodes[0].status, 'armed');
    assert.equal(zones.nodes[1].status, 'disarmed');
    assert.equal(zones.nodes[2].status, 'bypassed');
    assert.equal(zones.nodes[3].status, 'error'); // fault → FAULT → derive 'error'
  });

  it('accepts Record<id, device> as source (Lares4Info shape)', () => {
    const input = adaptLares4Topology({
      lights: { 1: { id: 1, description: 'A', on: true }, 2: { id: 2, description: 'B', on: false } },
    });
    const topology = buildTopology(input);
    const lights = topology.groups.find((g) => g.kind === 'lights');
    assert.ok(lights);
    assert.equal(lights.nodes.length, 2);
  });

  it('outputs stay unknown (lares4-ts surface lacks state)', () => {
    const input = adaptLares4Topology({
      outputs: [
        { id: 1, description: 'Siren' },
        { id: 2, description: 'Strobe' },
      ],
    });
    const topology = buildTopology(input);
    const outputs = topology.groups.find((g) => g.kind === 'outputs');
    assert.ok(outputs);
    assert.equal(outputs.nodes[0].status, 'unknown');
    assert.equal(outputs.nodes[1].status, 'unknown');
  });

  it('skips empty kinds in output', () => {
    const input = adaptLares4Topology({
      lights: [{ id: 1, description: 'A', on: true }],
    });
    const topology = buildTopology(input);
    assert.equal(topology.groups.length, 1);
    assert.equal(topology.groups[0].kind, 'lights');
  });
});
