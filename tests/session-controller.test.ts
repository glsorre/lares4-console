import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DesktopProfilesRepository } from '../src/desktop/runtime/profiles-repository-desktop.js';
import { SessionController } from '../src/desktop/runtime/session-controller.js';
import type { ClientEnv, CreateLaresClientOptions } from '../src/infra/lares-client.js';
import type { SocketEventEmitted } from '../src/infra/socket-types.js';

// Adapters: tests still author raw JSON strings; production listeners now receive SocketFrame.
const adaptSend = (fn?: CreateLaresClientOptions['onSocketSend']) =>
  fn ? (raw: string) => fn({ raw, ts: Date.now() }) : undefined;
const adaptReceive = (fn?: CreateLaresClientOptions['onSocketReceive']) =>
  fn ? (raw: string) => fn({ raw, ts: Date.now() }) : undefined;

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

  it('correlates ACK with sent TX, suppresses paired ACK row, and patches ack into TX group', async () => {
    const { lares, socket, subs } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    captured?.('{"CMD":"LIGHTS","ID":"42","PAYLOAD":{"STA":"ON"}}');
    assert.equal(c.snapshot().pendingTxCount, 1);
    const cb = subs[0];
    cb({ type: 'response', message: '{"ID":"42","PAYLOAD":{"RESULT":"OK"}}' });
    const snap = c.snapshot();
    // Paired ACK no longer produces its own row — it's pasted onto the TX entries.
    assert.equal(snap.logEntries.filter((e) => e.tag === 'ACK').length, 0);
    assert.equal(snap.pendingTxCount, 0);
    const taggedTx = snap.logEntries.filter((e) => e.tag === 'RAW_TX' && e.correlationId === '42');
    assert.equal(taggedTx.length, 2);
    assert.equal(typeof taggedTx[0]?.latencyMs, 'number');
    assert.ok(taggedTx[0]?.ack, 'expected ack metadata patched onto TX entries');
    assert.equal(taggedTx[0]?.ack?.result, 'OK');
    assert.equal(taggedTx[0]?.ack?.latencyMs, taggedTx[0]?.latencyMs);
  });

  it('correlates ACK even when sent and acks filters are disabled', async () => {
    const { lares, socket, subs } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    // Disable both sent and acks rendering; correlation must still work.
    await c.submit('events errors');
    captured?.('{"CMD":"LIGHTS","ID":"99","PAYLOAD":{"STA":"ON"}}');
    assert.equal(c.snapshot().pendingTxCount, 1);
    subs[0]({ type: 'response', message: '{"ID":"99","PAYLOAD":{"RESULT":"OK"}}' });
    const snap = c.snapshot();
    assert.equal(snap.pendingTxCount, 0);
    // No RAW_TX or ACK rendered (filter excluded both), but pending is cleared.
    assert.equal(snap.logEntries.filter((e) => e.tag === 'RAW_TX').length, 0);
    assert.equal(snap.logEntries.filter((e) => e.tag === 'ACK').length, 0);
  });

  it('clears pending on WS receive when no response is emitted (READ_RES path) and suppresses paired RAW_RX', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    let capturedReceive: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        capturedReceive = adaptReceive(options?.onSocketReceive);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    captured?.('{"CMD":"READ","ID":"5","PAYLOAD":{"TYPES":["LIGHTS"]}}');
    assert.equal(c.snapshot().pendingTxCount, 1);
    // Simulate lares4-ts: READ_RES arrives via WS message hook, never as `response`.
    capturedReceive?.('{"CMD":"READ_RES","ID":"5","PAYLOAD":{"RESULT":"OK"}}');
    const snap = c.snapshot();
    assert.equal(snap.pendingTxCount, 0);
    const tx = snap.logEntries.filter((e) => e.tag === 'RAW_TX' && e.correlationId === '5');
    assert.equal(tx.length, 2);
    assert.equal(typeof tx[0]?.latencyMs, 'number');
    // No ACK pushed since no response event fired.
    assert.equal(snap.logEntries.filter((e) => e.tag === 'ACK').length, 0);
    // Paired RAW_RX is now suppressed — the suffix chip + AckSection already surface this frame.
    assert.equal(snap.logEntries.filter((e) => e.tag === 'RAW_RX').length, 0);
    // Raw-frame ACK still pastes ack metadata onto the TX group so the suffix chip can render.
    assert.equal(tx[0]?.ack?.result, 'OK');
    assert.equal(typeof tx[0]?.ack?.latencyMs, 'number');
    assert.ok(tx[0]?.ack?.payload, 'ack payload preserved for detail pane');
  });

  it('uncorrelated raw frames (panel-pushed changes) still produce a RAW_RX row', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let capturedReceive: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        capturedReceive = adaptReceive(options?.onSocketReceive);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    // Make sure the raw filter is on so RAW_RX could be pushed.
    await c.submit('events raw');
    // Frame with no matching pendingTx (no CMD pair, no ID echo): should not correlate.
    capturedReceive?.('{"REALTIME":{"CHANGES":[{"ID":"1"}]}}');
    const rx = c.snapshot().logEntries.filter((e) => e.tag === 'RAW_RX');
    assert.equal(rx.length, 1, 'uncorrelated raw frame must remain visible as RAW_RX');
  });

  it('raw-frame ACK with RESULT_DETAIL prefers detail over generic result', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    let capturedReceive: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        capturedReceive = adaptReceive(options?.onSocketReceive);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    captured?.('{"CMD":"LIGHTS","ID":"11","PAYLOAD":{"STA":"ON"}}');
    capturedReceive?.('{"CMD":"LIGHTS_RES","ID":"11","PAYLOAD":{"RESULT":"OK","RESULT_DETAIL":"OK_APPLIED"}}');
    const snap = c.snapshot();
    const tx = snap.logEntries.find((e) => e.tag === 'RAW_TX' && e.correlationId === '11');
    assert.ok(tx);
    assert.equal(tx?.ack?.result, 'OK_APPLIED');
  });

  it('correlates by CMD/PAYLOAD_TYPE pair when reply ID does not echo request ID', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    let capturedReceive: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        capturedReceive = adaptReceive(options?.onSocketReceive);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    captured?.('{"CMD":"LOGIN","ID":"1","PAYLOAD_TYPE":"UNKNOWN","PAYLOAD":{}}');
    assert.equal(c.snapshot().pendingTxCount, 1);
    capturedReceive?.('{"CMD":"LOGIN_RES","ID":"999","PAYLOAD_TYPE":"UNKNOWN","PAYLOAD":{}}');
    const snap = c.snapshot();
    assert.equal(snap.pendingTxCount, 0);
    const tx = snap.logEntries.filter((e) => e.tag === 'RAW_TX' && e.correlationId === '1');
    assert.equal(tx.length, 2);
    assert.equal(typeof tx[0]?.latencyMs, 'number');
  });

  it('correlates READ_RES by CMD pair, FIFO when payload_type differs', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    let capturedReceive: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        capturedReceive = adaptReceive(options?.onSocketReceive);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    captured?.('{"CMD":"READ","ID":"1","PAYLOAD_TYPE":"STATUS_SYSTEM","PAYLOAD":{}}');
    captured?.('{"CMD":"READ","ID":"2","PAYLOAD_TYPE":"CFG_THERMOSTATS","PAYLOAD":{}}');
    assert.equal(c.snapshot().pendingTxCount, 2);
    capturedReceive?.('{"CMD":"READ_RES","ID":"99","PAYLOAD_TYPE":"STATUS_SYSTEM","PAYLOAD":{}}');
    const snap = c.snapshot();
    assert.equal(snap.pendingTxCount, 1);
    // The matched one is id=1 (STATUS_SYSTEM); id=2 (CFG_THERMOSTATS) still pending.
    const tx1 = snap.logEntries.filter((e) => e.tag === 'RAW_TX' && e.correlationId === '1');
    assert.equal(tx1.length, 2);
    assert.equal(typeof tx1[0]?.latencyMs, 'number');
    const tx2 = snap.logEntries.filter((e) => e.tag === 'RAW_TX' && e.correlationId === '2');
    assert.equal(tx2[0]?.latencyMs, undefined);
  });

  it('correlates REGISTER_ACK by stripping _ACK suffix on PAYLOAD_TYPE', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    let capturedReceive: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        capturedReceive = adaptReceive(options?.onSocketReceive);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    captured?.('{"CMD":"REALTIME","ID":"1","PAYLOAD_TYPE":"REGISTER","PAYLOAD":{}}');
    capturedReceive?.('{"CMD":"REALTIME_RES","ID":"42","PAYLOAD_TYPE":"REGISTER_ACK","PAYLOAD":{}}');
    assert.equal(c.snapshot().pendingTxCount, 0);
  });

  it('correlateAck reads ID from PAYLOAD.ID fallback', async () => {
    const { lares, socket, subs } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    captured?.('{"CMD":"LIGHTS","ID":"7","PAYLOAD":{"STA":"ON"}}');
    // ACK with ID buried inside PAYLOAD.
    subs[0]({ type: 'response', message: '{"PAYLOAD":{"ID":"7","RESULT":"OK"}}' });
    const snap = c.snapshot();
    assert.equal(snap.pendingTxCount, 0);
    // Paired ACK suppressed; correlation surfaces as ack metadata on the TX group.
    const tx = snap.logEntries.find((e) => e.tag === 'RAW_TX' && e.correlationId === '7');
    assert.ok(tx);
    assert.equal(tx?.ack?.result, 'OK');
  });

  it('pendingTx ages out unacked entries after timeout', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    const realNow = Date.now;
    let fakeNow = realNow();
    Date.now = () => fakeNow;
    try {
      captured?.('{"CMD":"READ","ID":"1"}');
      assert.equal(c.snapshot().pendingTxCount, 1);
      // Advance past timeout; trigger sweep via a new TX.
      fakeNow += 31_000;
      captured?.('{"CMD":"READ","ID":"2"}');
      // First entry aged out; only the new one is pending.
      assert.equal(c.snapshot().pendingTxCount, 1);
    } finally {
      Date.now = realNow;
    }
  });

  it('trigger rule sets highlight on matching entries (licensed)', async () => {
    const { lares, socket, subs } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      isTriggersLicensed: () => true,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    await c.saveTriggers([{
      id: 'r1', name: 'errors-red', enabled: true, match: 'tag:ERROR',
      actions: [{ kind: 'highlight', color: 'red' }],
    }]);
    subs[0]({ type: 'error', message: 'boom' });
    const err = c.snapshot().logEntries.find((e) => e.tag === 'ERROR');
    assert.equal(err?.highlight, 'red');
  });

  it('trigger pause action flips liveStreamPaused (licensed)', async () => {
    const { lares, socket, subs } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      isTriggersLicensed: () => true,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    await c.saveTriggers([{
      id: 'r1', name: 'pause-on-err', enabled: true, match: 'tag:ERROR',
      actions: [{ kind: 'pause' }],
    }]);
    assert.equal(c.snapshot().liveStreamPaused, false);
    subs[0]({ type: 'error', message: 'boom' });
    assert.equal(c.snapshot().liveStreamPaused, true);
  });

  it('saveTriggers rejects when triggers unlicensed', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      isTriggersLicensed: () => false,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    await assert.rejects(
      () => c.saveTriggers([{
        id: 'r1', name: 'x', enabled: true, match: 'tag:ERROR',
        actions: [{ kind: 'highlight', color: 'red' }],
      }]),
      /commercial license/,
    );
  });

  it('unlicensed triggers do not evaluate stored rules', async () => {
    // Pre-stage profile with a trigger that would normally highlight ERROR rows.
    const initial = JSON.stringify({
      version: 1,
      defaultProfile: 'p',
      profiles: [{
        name: 'p', ip: '1', pin: '2', wss: true, sender: 's',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        triggers: [{
          id: 'r1', name: 'x', enabled: true, match: 'tag:ERROR',
          actions: [{ kind: 'highlight', color: 'red' }],
        }],
      }],
    });
    let stored = initial;
    const repo = new DesktopProfilesRepository({
      read: async () => stored,
      write: async (content) => { stored = content; },
    });
    const { lares, socket, subs } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      profiles: repo,
      isTriggersLicensed: () => false,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true, profileName: 'p' });
    // Rules hydrate (read-only fallback).
    assert.equal(c.snapshot().triggers.length, 1);
    subs[0]({ type: 'error', message: 'boom' });
    const err = c.snapshot().logEntries.find((e) => e.tag === 'ERROR');
    assert.equal(err?.highlight, undefined);
  });

  it('toggleBookmark throws when annotations unlicensed', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      isAnnotationsLicensed: () => false,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    assert.throws(() => c.toggleBookmark('g1'), /commercial license/);
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
        captured = adaptSend(options?.onSocketSend);
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
      isMacrosLicensed: () => true,
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
      isMacrosLicensed: () => true,
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

  it('saveMacro rejects when macros are unlicensed', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      isMacrosLicensed: () => false,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    await assert.rejects(
      () => c.saveMacro({ name: 'x', steps: [{ command: 'help' }] }),
      /Macros require a commercial license/,
    );
    assert.equal(c.snapshot().macros.length, 0);
  });

  it('runMacro throws and does not start playback when unlicensed', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      isMacrosLicensed: () => false,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    assert.throws(() => c.runMacro('any-id'), /Macros require a commercial license/);
    assert.equal(c.snapshot().activeMacro, undefined);
  });

  it('startRecordingMacro throws and submit does not buffer steps when unlicensed', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      isMacrosLicensed: () => false,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    assert.throws(() => c.startRecordingMacro(), /Macros require a commercial license/);
    assert.equal(c.snapshot().recordingMacro, false);
    await c.submit('help');
    assert.equal(c.snapshot().recordingMacroSteps, 0);
  });

  it('saveMacro works when macros are licensed', async () => {
    const { lares, socket } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
      isMacrosLicensed: () => true,
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    const macro = await c.saveMacro({ name: 'ok', steps: [{ command: 'help' }] });
    assert.equal(macro.name, 'ok');
    assert.equal(c.snapshot().macros.length, 1);
  });

  it('onSocketSend falls back to raw text for non-JSON frames', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
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

  it('attributes RAW_TX during executeCommand to source=command, and pastes ACK metadata onto the TX group', async () => {
    const { lares, subs } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    const stubSocket: { send: (cmd: string, ptype: string, payload: Record<string, unknown>) => void;
      messages: { subscribe: (fn: (e: SocketEventEmitted) => void) => () => void } } = {
      // Bridge command-router socketSend → onSocketSend so recordSent fires inside the command context.
      send: (cmd, ptype, payload) => {
        const json = JSON.stringify({ CMD: cmd, PAYLOAD_TYPE: ptype, ID: '77', PAYLOAD: payload });
        captured?.(json);
      },
      messages: {
        subscribe(fn) {
          subs.push(fn);
          return () => {
            const i = subs.indexOf(fn);
            if (i >= 0) subs.splice(i, 1);
          };
        },
      },
    };
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        return { lares: lares as never, socket: stubSocket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    await c.submit('raw send LIGHTS WRITE {"STA":"ON"}');
    const tx = c.snapshot().logEntries.filter((e) => e.tag === 'RAW_TX');
    assert.ok(tx.length >= 1, 'RAW_TX recorded');
    assert.ok(tx.every((e) => e.source === 'command'),
      'all RAW_TX from inside executeCommand attribute to command');
    subs[0]({ type: 'response', message: '{"ID":"77","PAYLOAD":{"RESULT":"OK"}}' });
    const snap = c.snapshot();
    // Paired ACK no longer emits its own row; the TX group carries the ack metadata.
    assert.equal(snap.logEntries.filter((e) => e.tag === 'ACK').length, 0);
    const txWithAck = snap.logEntries.find((e) => e.tag === 'RAW_TX' && e.correlationId === '77');
    assert.ok(txWithAck, 'expected TX entry for ID=77');
    assert.equal(txWithAck?.source, 'command', 'TX still attributes to command');
    assert.equal(txWithAck?.ack?.result, 'OK', 'ACK result pasted onto TX entry');
  });

  it('socket change events attribute to source=lifecycle', async () => {
    const { lares, socket, subs } = stubLaresAndSocket();
    const c = new SessionController({
      createClient: async () => ({ lares: lares as never, socket }),
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    subs[0]({ type: 'change', message: '{"LIGHTS":{"ID":"1","STA":"ON"}}' });
    const change = c.snapshot().logEntries.find((e) => e.tag === 'CHANGE');
    assert.ok(change);
    assert.equal(change?.source, 'lifecycle');
  });

  it('RAW_TX outside executeCommand attributes to source=wire', async () => {
    const { lares, socket } = stubLaresAndSocket();
    let captured: ((raw: string) => void) | undefined;
    const c = new SessionController({
      createClient: async (_env, options) => {
        captured = adaptSend(options?.onSocketSend);
        return { lares: lares as never, socket };
      },
    });
    await c.connect({ ip: '1', pin: '2', sender: 's', wss: true });
    // Simulate a heartbeat-style send by the library, no user command in flight.
    captured?.('{"CMD":"PING","ID":"500","PAYLOAD":{}}');
    const tx = c.snapshot().logEntries.filter((e) => e.tag === 'RAW_TX');
    assert.ok(tx.length >= 1);
    assert.ok(tx.every((e) => e.source === 'wire'),
      'unattributed RAW_TX falls to wire');
  });
});
