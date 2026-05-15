import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCompletion, suggestCompletions } from '../src/core/autocomplete.js';
import { ROOT_COMMANDS } from '../src/core/command-spec.js';

describe('suggestCompletions', () => {
  it('returns all root commands for empty input', () => {
    assert.deepEqual(suggestCompletions(''), [...ROOT_COMMANDS]);
  });

  it('filters root commands by prefix', () => {
    assert.deepEqual(suggestCompletions('sta'), ['state']);
  });

  it('returns secondary commands once root is followed by a space', () => {
    assert.deepEqual(suggestCompletions('lights '), ['on', 'off', 'dim']);
  });

  it('filters secondary commands by prefix', () => {
    assert.deepEqual(suggestCompletions('lights o'), ['on', 'off']);
  });

  it('keeps exact match first, then prefix matches', () => {
    const list = suggestCompletions('state all');
    assert.equal(list[0], 'all');
  });

  it('returns an empty list when the root has no secondaries past index 1', () => {
    assert.deepEqual(suggestCompletions('state all extra '), []);
  });

  it('returns an empty list for unknown roots', () => {
    assert.deepEqual(suggestCompletions('madeup '), []);
  });
});

describe('applyCompletion', () => {
  it('replaces the only token and appends a space', () => {
    assert.equal(applyCompletion('st', 'state'), 'state ');
  });

  it('appends a new token after a trailing space', () => {
    assert.equal(applyCompletion('state ', 'all'), 'state all ');
  });

  it('replaces the last partial token after the root', () => {
    assert.equal(applyCompletion('state l', 'lights'), 'state lights ');
  });

  it('appends a fresh suggestion when input is empty', () => {
    assert.equal(applyCompletion('', 'help'), 'help ');
  });
});
