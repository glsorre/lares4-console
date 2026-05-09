import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCommandTokens, parseNumber } from '../src/core/parsers.js';

describe('parsers', () => {
  describe('parseNumber', () => {
    it('parses finite numeric values', () => {
      assert.equal(parseNumber('12', 'id'), 12);
      assert.equal(parseNumber('1.5', 'level'), 1.5);
    });

    it('throws on missing value', () => {
      assert.throws(() => parseNumber(undefined, 'id'), /Missing required numeric argument: id/);
    });

    it('throws on non-finite value', () => {
      assert.throws(() => parseNumber('abc', 'id'), /Invalid number for id: abc/);
      assert.throws(() => parseNumber('Infinity', 'id'), /Invalid number for id: Infinity/);
    });
  });

  describe('parseCommandTokens', () => {
    it('returns empty array for blank input', () => {
      assert.deepEqual(parseCommandTokens('   '), []);
    });

    it('handles quoted JSON payload', () => {
      assert.deepEqual(parseCommandTokens(`raw send X Y '{"a":1}'`), [
        'raw',
        'send',
        'X',
        'Y',
        '{"a":1}',
      ]);
    });

    it('handles escaped spaces', () => {
      assert.deepEqual(parseCommandTokens('state a\\ b'), ['state', 'a b']);
    });

    it('keeps trailing backslash when escaping at end', () => {
      assert.deepEqual(parseCommandTokens('raw send X Y \\'), ['raw', 'send', 'X', 'Y', '\\']);
    });
  });
});

