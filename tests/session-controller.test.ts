import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SessionController } from '../src/desktop/runtime/session-controller.js';
import type { ClientEnv } from '../src/infra/lares-client.js';
import type { SocketEventEmitted } from '../src/infra/socket-types.js';

/** Minimal stubs for executing `help` and receiving socket events offline. */
function stubLaresAndSocket() {
  const subs: Array<(e: SocketEventEmitted) => void> = [];
  const lares = {
    lights: [],
    covers: [],
    switches: [],
    gates: [],
    thermostats: [],
    zones: [],
    scenarios: [],
    outputs: [],
    systemStatus: {},
    close: () => {},
    switchOn: () => {},
    switchOff: () => {},
    dimmerTo: () => {},
    rollUp: () => {},
    rollDown: () => {},
    rollStop: () => {},
    rollTo: () => {},
    triggerScenario: () => {},
  };
  const socket = {
    send: () => {},
    messages: {
      subscribe(fn: (e: SocketEventEmitted) => void) {
        subs.push(fn);
        return () => {
          const i = subs.indexOf(fn);
          if (i >= 0) subs.splice(i, 1);
        };
      },
    },
  };
  return { lares, socket, subs };
}

describe('SessionController', () => {
  it('connect failure sets error state', async () => {
    const c = new SessionController({
      createClient: async (env: ClientEnv) => {
        void env;
        throw new Error('boom');
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    const s = c.snapshot();
    assert.equal(s.connectionStatus, 'error');
    assert.equal(s.error, 'boom');
    assert.equal(s.connected, false);
    assert.ok(s.logEntries.some((e) => e.tag === 'SYSTEM' && e.message.includes('Connection failed')));
  });

  it('submit routes commands through executeCommand when connected', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    await c.submit('help');
    const cmds = c.snapshot().logEntries.filter((e) => e.tag === 'CMD');
    assert.ok(cmds.some((e) => e.message.includes('Commands:')));
  });

  it('disconnect calls lares.close and clears connection', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let closed = false;
    Object.assign(lares, { close: () => { closed = true; } });
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    c.disconnect();
    assert.equal(closed, true);
    assert.equal(c.snapshot().connected, false);
  });

  it('socket subscription receives response events as ACK logs', async () => {
    const { lares, socket, subs } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    const cb = subs[0];
    assert.ok(typeof cb === 'function');
    cb({ type: 'response', message: '{"hello":1}' });
    const acks = c.snapshot().logEntries.filter((e) => e.tag === 'ACK');
    assert.equal(acks.length, 1);
    assert.ok(acks[0]?.message.includes('hello'));
  });
});
