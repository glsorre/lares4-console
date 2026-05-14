import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SessionController } from '../src/desktop/runtime/session-controller.js';
import { DesktopProfilesRepository } from '../src/desktop/runtime/profiles-repository-desktop.js';
import { setReadOnlyMode } from '../src/desktop/runtime/read-only-prefs.js';
import { createReadOnlyGuard, ReadOnlyBlockedError } from '../src/desktop/runtime/read-only-guard.js';
import type { SocketEventEmitted } from '../src/infra/socket-types.js';

function stubLaresAndSocket() {
  const calls: string[] = [];
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
    switchOn: (id: number) => { calls.push(`switchOn:${String(id)}`); },
    switchOff: (id: number) => { calls.push(`switchOff:${String(id)}`); },
    dimmerTo: () => {},
    rollUp: () => {},
    rollDown: () => {},
    rollStop: () => {},
    rollTo: () => {},
    triggerScenario: () => {},
  };
  const socket = {
    send: (cmd: string) => { calls.push(`socketSend:${cmd}`); },
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
  return { lares, socket, calls };
}

describe('read-only guard', () => {
  afterEach(() => setReadOnlyMode(false));

  it('proxies lares methods to throw ReadOnlyBlockedError', () => {
    const calls: string[] = [];
    const lares = {
      switchOn: (id: number) => { calls.push(`switchOn:${String(id)}`); },
      switchOff: () => {},
      dimmerTo: () => {},
      rollUp: () => {}, rollDown: () => {}, rollStop: () => {}, rollTo: () => {},
      triggerScenario: () => {},
    };
    const socketSend = () => { calls.push('send'); };
    const guard = createReadOnlyGuard(lares as never, socketSend as never);
    assert.throws(() => guard.lares.switchOn(1), ReadOnlyBlockedError);
    assert.equal(calls.length, 0);
  });

  it('socketSend throws ReadOnlyBlockedError', () => {
    const calls: string[] = [];
    const lares = {
      switchOn: () => {}, switchOff: () => {}, dimmerTo: () => {},
      rollUp: () => {}, rollDown: () => {}, rollStop: () => {}, rollTo: () => {},
      triggerScenario: () => {},
    };
    const socketSend = () => { calls.push('send'); };
    const guard = createReadOnlyGuard(lares as never, socketSend as never);
    assert.throws(() => guard.socketSend('CMD', 'TYPE', {}), ReadOnlyBlockedError);
    assert.equal(calls.length, 0);
  });
});

describe('SessionController read-only', () => {
  afterEach(() => setReadOnlyMode(false));

  it('blocks lights command and logs SYSTEM warn entry', async () => {
    const { lares, socket, calls } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    setReadOnlyMode(true);
    await c.submit('lights on 1');
    assert.equal(calls.includes('switchOn:1'), false, 'switchOn must not run');
    const blocked = c.snapshot().logEntries.find(
      (e) => e.tag === 'SYSTEM' && e.level === 'warn' && e.message.includes('Read-only'),
    );
    assert.ok(blocked, 'expected blocked log entry');
  });

  it('blocks raw send and does not invoke socket.send', async () => {
    const { lares, socket, calls } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    setReadOnlyMode(true);
    await c.submit('raw send PING TYPE_A {"k":1}');
    assert.equal(calls.some((c2) => c2.startsWith('socketSend:')), false);
  });

  it('allows local commands while read-only', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    setReadOnlyMode(true);
    await c.submit('format json');
    assert.equal(c.snapshot().outputFormat, 'json');
    await c.submit('help');
    const logs = c.snapshot().logEntries.filter((e) => e.tag === 'LOG');
    assert.ok(logs.some((e) => e.message.includes('Commands:')));
  });

  it('lets commands through when read-only off', async () => {
    const { lares, socket, calls } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    setReadOnlyMode(false);
    await c.submit('lights on 1');
    assert.ok(calls.includes('switchOn:1'));
  });

  it('exposes readOnly in snapshot and tracks toggle', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    assert.equal(c.snapshot().readOnly, false);
    setReadOnlyMode(true);
    assert.equal(c.snapshot().readOnly, true);
    setReadOnlyMode(false);
    assert.equal(c.snapshot().readOnly, false);
  });

  it('profile readOnly:true auto-enables read-only on connect', async () => {
    let stored = '';
    const profiles = new DesktopProfilesRepository({
      read: async () => stored || null,
      write: async (content) => { stored = content; },
    });
    await profiles.upsert({
      name: 'site', ip: '1.1.1.1', pin: '1', wss: true, sender: 's', readOnly: true,
    });
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      profiles,
      createClient: async () => ({ lares: lares as never, socket }),
    });
    assert.equal(c.snapshot().readOnly, false);
    await c.connect({ ip: '1.1.1.1', pin: '1', sender: 's', wss: true, profileName: 'site' });
    assert.equal(c.snapshot().readOnly, true);
  });

  it('runMacro refuses when read-only', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      isMacrosLicensed: () => true,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    setReadOnlyMode(true);
    assert.throws(() => c.runMacro('whatever'), /Read-only/);
  });
});

describe('profile readOnly persistence', () => {
  it('round-trips readOnly through upsert and readAll', async () => {
    let stored = '';
    const repo = new DesktopProfilesRepository({
      read: async () => stored || null,
      write: async (content) => { stored = content; },
    });
    await repo.upsert({
      name: 'home', ip: '1.1.1.1', pin: '1', wss: true, sender: 's', readOnly: true,
    });
    const after = await repo.readAll();
    assert.equal(after.profiles[0]?.readOnly, true);
    await repo.upsert({
      name: 'home', ip: '1.1.1.1', pin: '1', wss: true, sender: 's', readOnly: false,
    });
    const next = await repo.readAll();
    assert.equal(next.profiles[0]?.readOnly, false);
  });
});
