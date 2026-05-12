import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MacroEngine } from '../src/core/macro-engine.js';
import type { Macro } from '../src/core/macros.js';

function makeMacro(steps: { command: string; delayMs?: number }[]): Macro {
  return {
    id: 'm1', name: 'test', steps,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('MacroEngine', () => {
  it('plays steps in order via submit', async () => {
    const submitted: string[] = [];
    const engine = new MacroEngine(
      (line) => { submitted.push(line); },
      () => {},
      () => {},
    );
    engine.load(makeMacro([{ command: 'a', delayMs: 0 }, { command: 'b', delayMs: 0 }, { command: 'c', delayMs: 0 }]));
    engine.play();
    await wait(50);
    assert.deepEqual(submitted, ['a', 'b', 'c']);
    assert.equal(engine.status, 'paused');
    assert.equal(engine.position, 3);
  });

  it('respects per-step delayMs scaled by speed', async () => {
    const submitted: number[] = [];
    const engine = new MacroEngine(
      () => { submitted.push(Date.now()); },
      () => {},
      () => {},
    );
    engine.setSpeed(4);
    engine.load(makeMacro([{ command: 'a', delayMs: 0 }, { command: 'b', delayMs: 200 }]));
    const t0 = Date.now();
    engine.play();
    await wait(120);
    assert.equal(submitted.length, 2);
    const dt = submitted[1] - t0;
    assert.ok(dt >= 40 && dt < 200, `expected ~50ms gap, got ${String(dt)}ms`);
  });

  it('step advances one at a time without auto-progress', async () => {
    const submitted: string[] = [];
    const engine = new MacroEngine(
      (line) => { submitted.push(line); },
      () => {},
      () => {},
    );
    engine.load(makeMacro([{ command: 'a', delayMs: 0 }, { command: 'b', delayMs: 0 }]));
    engine.step();
    await wait(10);
    assert.deepEqual(submitted, ['a']);
    assert.equal(engine.status, 'paused');
    engine.step();
    await wait(10);
    assert.deepEqual(submitted, ['a', 'b']);
  });

  it('pauses and calls onError when submit throws', async () => {
    const submitted: string[] = [];
    let errorAt = -1;
    const engine = new MacroEngine(
      (line) => {
        submitted.push(line);
        if (line === 'boom') throw new Error('nope');
      },
      () => {},
      (_err, idx) => { errorAt = idx; },
    );
    engine.load(makeMacro([{ command: 'a', delayMs: 0 }, { command: 'boom', delayMs: 0 }, { command: 'c', delayMs: 0 }]));
    engine.play();
    await wait(60);
    assert.deepEqual(submitted, ['a', 'boom']);
    assert.equal(errorAt, 1);
    assert.equal(engine.status, 'paused');
  });

  it('stop resets state', async () => {
    const engine = new MacroEngine(() => {}, () => {}, () => {});
    engine.load(makeMacro([{ command: 'a' }, { command: 'b' }]));
    assert.equal(engine.status, 'paused');
    engine.stop();
    assert.equal(engine.status, 'stopped');
    assert.equal(engine.position, 0);
    assert.equal(engine.name, undefined);
  });
});
