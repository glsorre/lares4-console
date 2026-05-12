import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DesktopProfilesRepository } from '../src/desktop/runtime/profiles-repository-desktop.js';
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
    const cmds = c.snapshot().logEntries.filter((e) => e.tag === 'LOG');
    assert.ok(cmds.some((e) => e.message.includes('Commands:')));
  });

  it('submit bundles command output under one groupId', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    await c.submit('help');
    const cmds = c.snapshot().logEntries.filter((e) => e.tag === 'LOG');
    assert.ok(cmds.length >= 2);
    const groupIds = new Set(cmds.map((e) => e.groupId));
    assert.equal(groupIds.size, 1, 'all CMD entries from one submit share a groupId');
    const onlyGroup = [...groupIds][0];
    assert.ok(typeof onlyGroup === 'string' && onlyGroup.startsWith('cmd-'));
    assert.ok(cmds[0]?.message === 'Commands:');
  });

  it('submit preserves multi-line state output in a single CMD entry with payload', async () => {
    const { lares, socket } = stubLaresAndSocket();
    Object.assign(lares, {
      lights: [{ id: 1, name: 'kitchen', state: 'ON' }],
    });
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    await c.submit('state lights');
    const cmds = c.snapshot().logEntries.filter((e) => e.tag === 'LOG');
    assert.equal(cmds.length, 1);
    assert.ok(cmds[0]?.message.includes('\n'), 'multi-line text preserved in one entry');
    assert.ok(cmds[0]?.payload !== undefined, 'payload attached for format-toggle reformatting');
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

  it('setDefaultProfileName updates stored default', async () => {
    const initial = JSON.stringify({
      version: 1,
      defaultProfile: 'a',
      profiles: [
        {
          name: 'a',
          ip: '1.1.1.1',
          pin: '1',
          wss: true,
          sender: 's',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
        {
          name: 'b',
          ip: '2.2.2.2',
          pin: '2',
          wss: false,
          sender: 't',
          createdAt: '2020-01-02T00:00:00.000Z',
          updatedAt: '2020-01-02T00:00:00.000Z',
        },
      ],
    });
    let stored = initial;
    const repo = new DesktopProfilesRepository({
      read: async () => stored,
      write: async (content) => {
        stored = content;
      },
    });
    const c = new SessionController({ profiles: repo });
    await c.setDefaultProfileName('b');
    const data = await c.listProfiles();
    assert.equal(data.defaultProfile, 'b');
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

  it('onSocketSend pushes CMD_TX entries with payload and redacts PIN', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = options?.onSocketSend;
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    assert.ok(typeof captured === 'function');
    captured?.('{"CMD":"LOGIN","ID":"1","PAYLOAD":{"PIN":"secret"}}');
    const cmdtx = c.snapshot().logEntries.filter((e) => e.tag === 'RAW_TX');
    assert.equal(cmdtx.length, 2);
    assert.ok(cmdtx[0]?.message.startsWith('→ LOGIN'));
    assert.ok(cmdtx[1]?.message.includes('***'));
    assert.ok(!cmdtx[1]?.message.includes('secret'));
    assert.equal(cmdtx[0]?.groupId, 'rawtx-1');
    assert.equal(cmdtx[1]?.groupId, 'rawtx-1');
    const payload = cmdtx[1]?.payload as { CMD: string };
    assert.equal(payload.CMD, 'LOGIN');
  });

  it('hydrates logTagFilters from connected profile and persists changes', async () => {
    const initial = JSON.stringify({
      version: 1,
      defaultProfile: 'h',
      profiles: [{
        name: 'h', ip: '1', pin: '2', wss: true, sender: 's',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        logTagFilters: ['ACK', 'CHANGE'],
      }],
    });
    let stored = initial;
    const repo = new DesktopProfilesRepository({
      read: async () => stored,
      write: async (content) => { stored = content; },
    });
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      profiles: repo,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true, profileName: 'h' });
    assert.deepEqual(c.snapshot().logTagFilters, ['ACK', 'CHANGE']);
    c.setLogTagFilters(['ERROR']);
    assert.deepEqual(c.snapshot().logTagFilters, ['ERROR']);
    await new Promise((r) => setImmediate(r));
    const persisted = JSON.parse(stored) as { profiles: { logTagFilters?: string[] }[] };
    assert.deepEqual(persisted.profiles[0]?.logTagFilters, ['ERROR']);
    c.setLogTagFilters(undefined);
    await new Promise((r) => setImmediate(r));
    const cleared = JSON.parse(stored) as { profiles: { logTagFilters?: string[] }[] };
    assert.equal(cleared.profiles[0]?.logTagFilters, undefined);
  });

  it('hydrates macros from connected profile and saves new ones', async () => {
    const initial = JSON.stringify({
      version: 1,
      defaultProfile: 'h',
      profiles: [{
        name: 'h', ip: '1', pin: '2', wss: true, sender: 's',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        macros: [{
          id: 'a', name: 'morning', steps: [{ command: 'lights on 1' }],
          createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
        }],
      }],
    });
    let stored = initial;
    const repo = new DesktopProfilesRepository({
      read: async () => stored,
      write: async (content) => { stored = content; },
    });
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      profiles: repo,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true, profileName: 'h' });
    assert.equal(c.snapshot().macros.length, 1);
    assert.equal(c.snapshot().macros[0]?.name, 'morning');
    await c.saveMacro({ name: 'evening', steps: [{ command: 'lights off 1' }] });
    assert.equal(c.snapshot().macros.length, 2);
    await new Promise((r) => setImmediate(r));
    const persisted = JSON.parse(stored) as { profiles: { macros?: { name: string }[] }[] };
    assert.equal(persisted.profiles[0]?.macros?.length, 2);
  });

  it('records macro steps while recording, ignores macro-driven submits', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    c.startRecordingMacro();
    await c.submit('help');
    await c.submit('format pretty');
    assert.equal(c.snapshot().recordingMacroSteps, 2);
    const macro = await c.stopRecordingMacro('captured');
    assert.ok(macro);
    assert.equal(macro?.steps.length, 2);
    assert.equal(macro?.steps[0]?.command, 'help');
    assert.equal(c.snapshot().recordingMacro, false);
  });

  it('onSocketSend falls back to raw text for non-JSON frames', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = options?.onSocketSend;
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    captured?.('ping');
    const cmdtx = c.snapshot().logEntries.filter((e) => e.tag === 'RAW_TX');
    assert.equal(cmdtx.length, 2);
    assert.ok(cmdtx[0]?.message.startsWith('→ CMD'));
    assert.equal(cmdtx[1]?.message, 'ping');
    assert.equal(cmdtx[1]?.payload, undefined);
  });
});
