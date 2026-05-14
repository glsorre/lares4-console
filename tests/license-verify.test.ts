import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { getPublicKeyAsync, signAsync } from '@noble/ed25519';
import {
  __clearVerifyCacheForTests,
  verifyLicense,
} from '../src/desktop/runtime/license-verify.js';
import { installFakeTransport } from './helpers/fake-license-transport.js';

const PRIV = new Uint8Array(32); // zero seed
const PUB_HEX_PROMISE = getPublicKeyAsync(PRIV).then(toHex);

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/=+$/u, '').replace(/\+/g, '-').replace(/\//g, '_');
}

interface PayloadInput {
  v?: number;
  f: 'macros' | 'tabs' | 'triggers' | 'annotations' | '*';
  sub?: string;
  iat?: number;
  exp?: number;
}

async function mintToken(payload: PayloadInput, priv: Uint8Array = PRIV): Promise<string> {
  const full = {
    v: payload.v ?? 1,
    f: payload.f,
    sub: payload.sub ?? 'test@example.com',
    iat: payload.iat ?? Math.floor(Date.now() / 1000),
    ...(payload.exp !== undefined ? { exp: payload.exp } : {}),
  };
  const json = JSON.stringify(full);
  const payloadEnc = base64UrlEncode(new TextEncoder().encode(json));
  const sig = await signAsync(new TextEncoder().encode(payloadEnc), priv);
  return `LARES4-${payloadEnc}.${base64UrlEncode(sig)}`;
}

describe('license-verify', () => {
  beforeEach(async () => {
    const pubHex = await PUB_HEX_PROMISE;
    installFakeTransport({ pubkeysHex: [pubHex] });
    __clearVerifyCacheForTests();
  });

  it('verifies a well-formed token for the matching feature', async () => {
    const token = await mintToken({ f: 'macros' });
    const r = await verifyLicense(token, 'macros');
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.payload.f, 'macros');
  });

  it('rejects a token whose feature does not match', async () => {
    const token = await mintToken({ f: 'tabs' });
    const r = await verifyLicense(token, 'macros');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'feature-mismatch');
  });

  it('accepts a bundle token (f="*") for every feature', async () => {
    const token = await mintToken({ f: '*' });
    for (const id of ['macros', 'tabs', 'triggers', 'annotations'] as const) {
      const r = await verifyLicense(token, id);
      assert.equal(r.ok, true, `bundle should validate for ${id}`);
    }
  });

  it('rejects an expired token', async () => {
    const token = await mintToken({ f: 'macros', exp: Math.floor(Date.now() / 1000) - 60 });
    const r = await verifyLicense(token, 'macros');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'expired');
  });

  it('rejects a token with a tampered signature', async () => {
    const token = await mintToken({ f: 'macros' });
    const dot = token.lastIndexOf('.');
    const flipped = token.slice(0, dot + 1) + (token[dot + 1] === 'A' ? 'B' : 'A') + token.slice(dot + 2);
    const r = await verifyLicense(flipped, 'macros');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'bad-signature');
  });

  it('rejects tokens that do not start with the LARES4- prefix', async () => {
    const r = await verifyLicense('not-a-token', 'macros');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'malformed-prefix');
  });

  it('rejects malformed base64', async () => {
    const r = await verifyLicense('LARES4-not!base64.also$bad', 'macros');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'malformed-base64');
  });

  it('rejects tokens missing the dot separator', async () => {
    const r = await verifyLicense('LARES4-AAAA', 'macros');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'malformed-structure');
  });

  it('rejects tokens with an unsupported payload version', async () => {
    const token = await mintToken({ v: 99, f: 'macros' });
    const r = await verifyLicense(token, 'macros');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'unsupported-version');
  });

  it('reports pubkey-unconfigured when no key is configured', async () => {
    installFakeTransport({ pubkeysHex: [] });
    __clearVerifyCacheForTests();
    const token = await mintToken({ f: 'macros' });
    const r = await verifyLicense(token, 'macros');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'pubkey-unconfigured');
  });
});
