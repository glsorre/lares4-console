import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePayload,
  describeCmd,
  describeResultDetail,
  resultDetailSeverity,
} from '../src/core/protocol-dict.js';

describe('protocol-dict', () => {
  it('describeCmd returns description for known CMD', () => {
    assert.ok(describeCmd('LIGHTS'));
    assert.equal(describeCmd('NOPE'), undefined);
  });

  it('describeResultDetail handles common detail codes', () => {
    assert.ok(describeResultDetail('TIMEOUT'));
    assert.ok(describeResultDetail('UNAUTHORIZED'));
    assert.ok(describeResultDetail('CMD_PROCESSED'));
  });

  it('resultDetailSeverity classifies known and unknown details', () => {
    assert.equal(resultDetailSeverity('OK'), 'success');
    assert.equal(resultDetailSeverity('CMD_PROCESSED'), 'success');
    assert.equal(resultDetailSeverity('LOGIN_OK'), 'success');
    assert.equal(resultDetailSeverity('0x00'), 'success');
    assert.equal(resultDetailSeverity('TIMEOUT'), 'pending');
    assert.equal(resultDetailSeverity('PENDING'), 'pending');
    assert.equal(resultDetailSeverity('UNAUTHORIZED'), 'error');
    assert.equal(resultDetailSeverity('CMD_NOT_AVAILABLE'), 'error');
    assert.equal(resultDetailSeverity('SOMETHING_UNKNOWN'), 'error');
    assert.equal(resultDetailSeverity(undefined), undefined);
    assert.equal(resultDetailSeverity(''), undefined);
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

  it('decodePayload redacts PIN nested inside PAYLOAD', () => {
    const d = decodePayload({ CMD: 'CMD_LOGIN', PAYLOAD: { PIN: '1234', USER: 'u' } });
    const pinField = d?.innerFields.find((f) => f.key === 'PIN');
    assert.equal(pinField?.value, '***');
    const userField = d?.innerFields.find((f) => f.key === 'USER');
    assert.equal(userField?.value, 'u');
  });

  it('decodePayload redacts PIN nested deep inside structured values', () => {
    const d = decodePayload({
      CMD: 'CMD_LOGIN',
      PAYLOAD: { AUTH: { PIN: '9999', SESSION: 'abc' }, LIST: [{ pin: '7777' }] },
    });
    const auth = d?.innerFields.find((f) => f.key === 'AUTH');
    assert.deepEqual(auth?.value, { PIN: '***', SESSION: 'abc' });
    const list = d?.innerFields.find((f) => f.key === 'LIST');
    assert.deepEqual(list?.value, [{ pin: '***' }]);
  });

  it('decodePayload redacts PIN at top level regardless of key casing', () => {
    const d = decodePayload({ pin: '1234' });
    const pinField = d?.topFields.find((f) => f.key.toUpperCase() === 'PIN');
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
