import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ackResultChipClasses,
  connectionChipClasses,
} from '../src/desktop/runtime/status-chips.js';

describe('connectionChipClasses', () => {
  it('returns phase-specific classes for known statuses', () => {
    assert.match(connectionChipClasses('online'), /bg-conn-online/);
    assert.match(connectionChipClasses('connecting'), /bg-conn-connecting/);
    assert.match(connectionChipClasses('connecting'), /animate-pulse/);
    assert.match(connectionChipClasses('error'), /bg-conn-error/);
    assert.match(connectionChipClasses('idle'), /bg-conn-idle/);
  });

  it('falls back to idle classes for unknown statuses', () => {
    assert.equal(connectionChipClasses('something'), connectionChipClasses('idle'));
  });
});

describe('ackResultChipClasses', () => {
  it('returns muted classes when undefined', () => {
    assert.match(ackResultChipClasses(undefined), /bg-muted/);
  });

  it('returns emerald for success-like detail', () => {
    assert.match(ackResultChipClasses('OK'), /emerald/);
    assert.match(ackResultChipClasses('0x00'), /emerald/);
    assert.match(ackResultChipClasses('0'), /emerald/);
    assert.match(ackResultChipClasses('LOGIN_OK'), /emerald/);
  });

  it('returns amber for timeout/pending', () => {
    assert.match(ackResultChipClasses('TIMEOUT'), /amber/);
    assert.match(ackResultChipClasses('Pending response'), /amber/);
  });

  it('returns red for everything else', () => {
    assert.match(ackResultChipClasses('ERROR_FOO'), /red/);
    assert.match(ackResultChipClasses('0x42'), /red/);
  });
});
