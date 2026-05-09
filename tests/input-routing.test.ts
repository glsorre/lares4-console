import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveArrowIntent, toggleFocusArea } from '../src/app/input-routing.js';

describe('input routing', () => {
  it('toggles focus between command and scroll', () => {
    assert.equal(toggleFocusArea('command'), 'scroll');
    assert.equal(toggleFocusArea('scroll'), 'command');
  });

  it('ignores arrows during suppression window', () => {
    const intent = resolveArrowIntent({
      focusArea: 'command',
      input: 'state',
      suppressUntilMs: 100,
      lastWheelAtMs: 0,
      nowMs: 50,
    });
    assert.equal(intent, 'ignore');
  });

  it('routes arrows to scroll when focus is scroll', () => {
    const intent = resolveArrowIntent({
      focusArea: 'scroll',
      input: 'state',
      suppressUntilMs: 0,
      lastWheelAtMs: 0,
      nowMs: 1000,
    });
    assert.equal(intent, 'scroll');
  });

  it('routes command focus with text to history', () => {
    const intent = resolveArrowIntent({
      focusArea: 'command',
      input: 'state',
      suppressUntilMs: 0,
      lastWheelAtMs: 0,
      nowMs: 1000,
    });
    assert.equal(intent, 'history');
  });

  it('routes command focus empty input to scroll', () => {
    const intent = resolveArrowIntent({
      focusArea: 'command',
      input: '',
      suppressUntilMs: 0,
      lastWheelAtMs: 0,
      nowMs: 1000,
    });
    assert.equal(intent, 'scroll');
  });

  it('routes to scroll shortly after wheel activity', () => {
    const intent = resolveArrowIntent({
      focusArea: 'command',
      input: 'state',
      suppressUntilMs: 0,
      lastWheelAtMs: 900,
      nowMs: 1200,
    });
    assert.equal(intent, 'scroll');
  });
});

