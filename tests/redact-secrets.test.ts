import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from '../src/core/utils.js';

describe('redactSecrets', () => {
  it('redacts JSON-style "PIN":"value"', () => {
    assert.equal(
      redactSecrets('{"CMD":"CMD_LOGIN","PIN":"1234"}'),
      '{"CMD":"CMD_LOGIN","PIN":"***"}',
    );
  });

  it('redacts pretty-rendered PIN: value lines', () => {
    // existing regex normalizes the key to lowercase in the replacement.
    assert.equal(redactSecrets('PIN: 1234'), 'pin:***');
  });

  it('redacts assignment form pin=value', () => {
    assert.equal(redactSecrets('pin=1234'), 'pin=***');
  });

  it('redacts Ruby/Rust debug hash-rocket form', () => {
    assert.equal(redactSecrets('"pin" => "1234"'), '"pin" => "***"');
  });

  it('redacts free-text "PIN 1234" sequences', () => {
    assert.equal(
      redactSecrets('Login failed: PIN 1234 rejected'),
      'Login failed: PIN *** rejected',
    );
  });

  it('redacts ID_LOGIN and TOKEN JSON values', () => {
    assert.equal(
      redactSecrets('{"ID_LOGIN":"abc","TOKEN":"xyz"}'),
      '{"ID_LOGIN":"***","TOKEN":"***"}',
    );
  });

  it('leaves unrelated strings untouched', () => {
    const input = 'CMD: LIGHTS, STA: ON';
    assert.equal(redactSecrets(input), input);
  });

  it('redacts case-insensitive PIN forms', () => {
    assert.equal(redactSecrets('{"pin":"1234"}'), '{"pin":"***"}');
  });
});
