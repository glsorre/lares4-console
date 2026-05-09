import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { consumeSgrWheelFromBuffer, sgrWheelDirectionFromRawChunk } from '../src/app/sgr-wheel.js';

describe('sgr wheel parsing', () => {
  it('detects direction from raw chunk helper', () => {
    assert.equal(sgrWheelDirectionFromRawChunk('\u001B[<64;12;34M'), 'up');
    assert.equal(sgrWheelDirectionFromRawChunk('\u001B[<65;12;34M'), 'down');
    assert.equal(sgrWheelDirectionFromRawChunk('\u001B[<97;12;34m'), 'down');
    assert.equal(sgrWheelDirectionFromRawChunk('plain text'), null);
  });

  it('parses full packet and keeps a small tail buffer', () => {
    const parsed = consumeSgrWheelFromBuffer('\u001B[<65;12;34M');
    assert.equal(parsed.dir, 'down');
    assert.ok(parsed.rest.length <= 64);
  });

  it('handles split packet across chunks', () => {
    const first = consumeSgrWheelFromBuffer('\u001B[<6');
    assert.equal(first.dir, null);
    const second = consumeSgrWheelFromBuffer(`${first.rest}5;12;34M`);
    assert.equal(second.dir, 'down');
  });

  it('returns the last direction when multiple packets are present', () => {
    const parsed = consumeSgrWheelFromBuffer('\u001B[<64;1;1Mabc\u001B[<65;2;2m');
    assert.equal(parsed.dir, 'down');
  });

  it('maps 96 and 97 like 64 and 65', () => {
    assert.equal(consumeSgrWheelFromBuffer('\u001B[<96;12;34M').dir, 'up');
    assert.equal(consumeSgrWheelFromBuffer('\u001B[<97;12;34M').dir, 'down');
  });
});

