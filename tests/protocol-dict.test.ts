import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodePayload, describeCmd, describeResultDetail } from '../src/core/protocol-dict.js';

describe('protocol-dict', () => {
  it('describeCmd returns description for known CMD', () => {
    assert.ok(describeCmd('LIGHTS'));
    assert.equal(describeCmd('NOPE'), undefined);
  });

  it('describeResultDetail handles common detail codes', () => {
    assert.ok(describeResultDetail('TIMEOUT'));
    assert.ok(describeResultDetail('UNAUTHORIZED'));
  });

  it('decodePayload pulls CMD and PAYLOAD_TYPE', () => {
    const d = decodePayload({ CMD: 'LIGHTS', PAYLOAD_TYPE: 'STATUS', PAYLOAD: {} });
    assert.ok(d);
    assert.equal(d?.cmd, 'LIGHTS');
    assert.equal(d?.payloadType, 'STATUS');
    assert.ok(d?.cmdDescription);
  });

  it('decodePayload redacts PIN', () => {
    const d = decodePayload({ CMD: 'CMD_LOGIN', PIN: '1234', PAYLOAD: {} });
    const pinField = d?.topFields.find((f) => f.key === 'PIN');
    assert.equal(pinField?.value, '***');
  });

  it('decodePayload surfaces RESULT_DETAIL from inner PAYLOAD', () => {
    const d = decodePayload({
      CMD: 'CMD_USR_RES',
      PAYLOAD_TYPE: 'STATUS',
      PAYLOAD: { RESULT: 'KO', RESULT_DETAIL: 'TIMEOUT' },
    });
    assert.equal(d?.resultDetail, 'TIMEOUT');
    assert.ok(d?.resultDetailDescription);
  });

  it('decodePayload marks unknown shapes', () => {
    const d = decodePayload({ foo: 'bar' });
    assert.equal(d?.unknown, true);
  });

  it('decodePayload returns undefined for non-objects', () => {
    assert.equal(decodePayload(null), undefined);
    assert.equal(decodePayload('string'), undefined);
    assert.equal(decodePayload(42), undefined);
  });
});
