import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CommandHistory } from '../src/core/history.js';

describe('command history', () => {
  it('trims commands and ignores empty values', () => {
    const h = new CommandHistory();
    h.add('   ');
    h.add('  state all  ');
    assert.equal(h.previous(''), 'state all');
  });

  it('collapses consecutive duplicates', () => {
    const h = new CommandHistory();
    h.add('help');
    h.add('help');
    assert.equal(h.previous(''), 'help');
    assert.equal(h.previous(''), undefined);
  });

  it('navigates backward and forward with prefixes', () => {
    const h = new CommandHistory();
    h.add('state all');
    h.add('state lights');
    h.add('events all');

    assert.equal(h.previous('state'), 'state lights');
    assert.equal(h.previous('state'), 'state all');
    assert.equal(h.previous('state'), undefined);

    assert.equal(h.next('state'), 'state lights');
    assert.equal(h.next('state'), '');
  });

  it('resets next to empty string when end is reached', () => {
    const h = new CommandHistory();
    h.add('help');
    assert.equal(h.previous(''), 'help');
    assert.equal(h.next(''), '');
  });
});

