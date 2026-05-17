import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLogger } from '../src/infra/lares-logger.js';

interface ConsoleSpy {
  level: 'info' | 'warn' | 'error' | 'debug';
  args: unknown[];
}

const original = {
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

function spy(): { calls: ConsoleSpy[]; restore: () => void } {
  const calls: ConsoleSpy[] = [];
  console.info = (...args: unknown[]) => { calls.push({ level: 'info', args }); };
  console.warn = (...args: unknown[]) => { calls.push({ level: 'warn', args }); };
  console.error = (...args: unknown[]) => { calls.push({ level: 'error', args }); };
  console.debug = (...args: unknown[]) => { calls.push({ level: 'debug', args }); };
  return {
    calls,
    restore: () => {
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
      console.debug = original.debug;
    },
  };
}

describe('defaultLogger redaction', () => {
  afterEach(() => {
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    console.debug = original.debug;
  });

  it('redacts PIN inside JSON-shaped strings on every level', () => {
    const s = spy();
    try {
      defaultLogger.info('payload {"PIN":"1234"}');
      defaultLogger.warn('parsed pin=1234 ok');
      defaultLogger.error('Login failed: PIN 1234 rejected');
      defaultLogger.debug('frame PIN: 1234');
    } finally {
      s.restore();
    }
    assert.equal(s.calls.length, 4);
    for (const call of s.calls) {
      const text = String(call.args[0]);
      assert.ok(!/1234/.test(text), `expected redaction in "${text}"`);
      assert.ok(/\*\*\*/.test(text), `expected *** marker in "${text}"`);
    }
  });

  it('coerces non-string messages before redaction', () => {
    const s = spy();
    try {
      defaultLogger.error({ message: 'PIN 1234 rejected' } as unknown as string);
    } finally {
      s.restore();
    }
    const text = String(s.calls[0]?.args[0] ?? '');
    assert.ok(text.length > 0);
    assert.ok(!/1234/.test(text));
  });
});
