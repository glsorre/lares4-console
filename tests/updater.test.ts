import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  nextUpdaterState,
  runCheck,
  type UpdaterAdapter,
  type UpdaterState,
} from '../src/desktop/runtime/updater.js';

describe('nextUpdaterState', () => {
  const idle: UpdaterState = { phase: 'idle' };

  it('check-start moves idle → checking', () => {
    assert.deepEqual(nextUpdaterState(idle, { type: 'check-start' }), { phase: 'checking' });
  });

  it('check-result available carries info', () => {
    const result = nextUpdaterState({ phase: 'checking' }, {
      type: 'check-result',
      outcome: { kind: 'available', info: { version: '0.2.0', body: 'notes' } },
    });
    assert.equal(result.phase, 'available');
    if (result.phase === 'available') {
      assert.equal(result.info.version, '0.2.0');
      assert.equal(result.info.body, 'notes');
    }
  });

  it('check-result up-to-date transitions cleanly', () => {
    assert.deepEqual(
      nextUpdaterState({ phase: 'checking' }, { type: 'check-result', outcome: { kind: 'up-to-date' } }),
      { phase: 'up-to-date' },
    );
  });

  it('check-result error captures message', () => {
    const result = nextUpdaterState({ phase: 'checking' }, {
      type: 'check-result',
      outcome: { kind: 'error', message: 'network down' },
    });
    assert.equal(result.phase, 'error');
    if (result.phase === 'error') {
      assert.equal(result.message, 'network down');
    }
  });

  it('check-result unsupported maps to unsupported state', () => {
    assert.deepEqual(
      nextUpdaterState({ phase: 'checking' }, { type: 'check-result', outcome: { kind: 'unsupported' } }),
      { phase: 'unsupported' },
    );
  });

  it('install-start zeros progress', () => {
    const result = nextUpdaterState(
      { phase: 'available', info: { version: '0.2.0' } },
      { type: 'install-start' },
    );
    assert.deepEqual(result, { phase: 'installing', downloaded: 0, total: undefined });
  });

  it('install-progress accumulates downloaded', () => {
    const result = nextUpdaterState(
      { phase: 'installing', downloaded: 0, total: 1024 },
      { type: 'install-progress', downloaded: 512, total: 1024 },
    );
    assert.deepEqual(result, { phase: 'installing', downloaded: 512, total: 1024 });
  });

  it('install-done moves to installed', () => {
    assert.deepEqual(
      nextUpdaterState({ phase: 'installing', downloaded: 1024, total: 1024 }, { type: 'install-done' }),
      { phase: 'installed' },
    );
  });

  it('reset returns to idle', () => {
    assert.deepEqual(
      nextUpdaterState({ phase: 'error', message: 'x' }, { type: 'reset' }),
      { phase: 'idle' },
    );
  });
});

describe('runCheck', () => {
  it('null adapter → unsupported', async () => {
    const result = await runCheck(null);
    assert.deepEqual(result, { kind: 'unsupported' });
  });

  it('adapter returns null → up-to-date', async () => {
    const adapter: UpdaterAdapter = {
      check: async () => null,
      install: async () => undefined,
      restart: async () => undefined,
    };
    assert.deepEqual(await runCheck(adapter), { kind: 'up-to-date' });
  });

  it('adapter returns info → available', async () => {
    const adapter: UpdaterAdapter = {
      check: async () => ({ version: '0.3.0', body: 'shiny' }),
      install: async () => undefined,
      restart: async () => undefined,
    };
    const result = await runCheck(adapter);
    assert.equal(result.kind, 'available');
    if (result.kind === 'available') {
      assert.equal(result.info.version, '0.3.0');
      assert.equal(result.info.body, 'shiny');
    }
  });

  it('adapter throws Error → error.message captured', async () => {
    const adapter: UpdaterAdapter = {
      check: async () => { throw new Error('endpoint 404'); },
      install: async () => undefined,
      restart: async () => undefined,
    };
    const result = await runCheck(adapter);
    assert.deepEqual(result, { kind: 'error', message: 'endpoint 404' });
  });

  it('adapter throws non-Error → coerced to string', async () => {
    const adapter: UpdaterAdapter = {
      check: async () => { throw 'plain throw'; },
      install: async () => undefined,
      restart: async () => undefined,
    };
    assert.deepEqual(await runCheck(adapter), { kind: 'error', message: 'plain throw' });
  });
});
