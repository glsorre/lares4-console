import { verifyAsync } from '@noble/ed25519';
import {
  __setLicenseTransport,
  type LicenseTransport,
} from '../../src/desktop/runtime/license-transport.js';
import type {
  LicensePayload,
  LicenseVerifyResult,
  VerifyFailureReason,
} from '../../src/desktop/runtime/license-verify.js';

const TOKEN_PREFIX = 'LARES4-';
const PAYLOAD_VERSION = 1;

const ALLOWED_FEATURE_IDS: readonly (string)[] = [
  'bundle', 'macros', 'tabs', 'triggers', 'annotations', 'multiwindow',
];

function decodeBase64Url(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('odd-length hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function isValidFeatureClaim(value: unknown): value is LicensePayload['f'] {
  return (
    value === 'macros' || value === 'tabs' || value === 'triggers' ||
    value === 'annotations' || value === 'multiwindow' || value === '*'
  );
}

function parsePayload(bytes: Uint8Array): LicensePayload | null {
  let text: string;
  try { text = new TextDecoder().decode(bytes); } catch { return null; }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.v !== 'number') return null;
  if (typeof obj.f !== 'string' || !isValidFeatureClaim(obj.f)) return null;
  if (typeof obj.sub !== 'string') return null;
  if (typeof obj.iat !== 'number') return null;
  if (obj.exp !== undefined && typeof obj.exp !== 'number') return null;
  return {
    v: obj.v,
    f: obj.f,
    sub: obj.sub,
    iat: obj.iat,
    exp: typeof obj.exp === 'number' ? obj.exp : undefined,
  };
}

async function verifyTokenInJs(
  raw: string,
  featureId: string,
  pubkeysHex: readonly string[],
): Promise<LicenseVerifyResult> {
  if (!raw) return { ok: false, reason: 'malformed-structure' };
  if (pubkeysHex.length === 0 || pubkeysHex.every((k) => !k || k.length !== 64)) {
    return { ok: false, reason: 'pubkey-unconfigured' };
  }
  if (!raw.startsWith(TOKEN_PREFIX)) {
    return { ok: false, reason: 'malformed-prefix' };
  }
  const body = raw.slice(TOKEN_PREFIX.length);
  const dot = body.indexOf('.');
  if (dot <= 0 || dot === body.length - 1) {
    return { ok: false, reason: 'malformed-structure' };
  }
  const payloadEnc = body.slice(0, dot);
  const sigEnc = body.slice(dot + 1);
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = decodeBase64Url(payloadEnc);
    sigBytes = decodeBase64Url(sigEnc);
  } catch {
    return { ok: false, reason: 'malformed-base64' };
  }
  if (sigBytes.length !== 64) {
    return { ok: false, reason: 'malformed-base64' };
  }
  const signed = new TextEncoder().encode(payloadEnc);
  let sigValid = false;
  for (const candidate of pubkeysHex) {
    if (!candidate || candidate.length !== 64) continue;
    let pubkey: Uint8Array;
    try { pubkey = hexToBytes(candidate); } catch { continue; }
    if (pubkey.length !== 32) continue;
    try {
      if (await verifyAsync(sigBytes, signed, pubkey)) { sigValid = true; break; }
    } catch { /* try next */ }
  }
  if (!sigValid) return { ok: false, reason: 'bad-signature' };
  const payload = parsePayload(payloadBytes);
  if (!payload) return { ok: false, reason: 'malformed-payload' };
  if (payload.v !== PAYLOAD_VERSION) {
    return { ok: false, reason: 'unsupported-version' };
  }
  if (payload.exp !== undefined && payload.exp * 1000 <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (payload.f !== '*' && payload.f !== featureId) {
    return { ok: false, reason: 'feature-mismatch' };
  }
  return { ok: true, payload };
}

export interface FakeTransportHandle {
  /** In-memory keychain mirror. Tests can read/write to seed pre-existing state. */
  readonly store: Map<string, string>;
  readonly transport: LicenseTransport;
}

/**
 * Install a fake LicenseTransport backed by `@noble/ed25519` verify and an
 * in-memory map. Returns a handle with the underlying store so tests can
 * seed or inspect state directly without going through invoke.
 */
export function installFakeTransport(opts: { pubkeysHex: readonly string[] }): FakeTransportHandle {
  const store = new Map<string, string>();
  const transport: LicenseTransport = {
    verify: (raw, featureId) => verifyTokenInJs(raw, featureId, opts.pubkeysHex),
    save: async (featureId, raw) => {
      if (!ALLOWED_FEATURE_IDS.includes(featureId)) {
        return { ok: false, reason: 'malformed-payload' as VerifyFailureReason };
      }
      const probe = featureId === 'bundle' ? 'macros' : featureId;
      const result = await verifyTokenInJs(raw, probe, opts.pubkeysHex);
      if (!result.ok) return result;
      if (result.payload.f === '*') {
        store.set('bundle', raw);
        if (featureId !== 'bundle') store.delete(featureId);
      } else {
        store.set(result.payload.f, raw);
      }
      return result;
    },
    readAll: async () => Object.fromEntries(store),
    clear: async (featureId) => {
      store.delete(featureId);
    },
    completeMigration: async () => {
      store.set('_migrated', '1');
    },
  };
  __setLicenseTransport(transport);
  return { store, transport };
}
