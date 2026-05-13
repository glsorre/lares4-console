import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getPublicKeyAsync, signAsync } from '@noble/ed25519';

interface MutableGlobal {
  window?: unknown;
}

const LEGACY_KEY = 'lares4.commercialLicense';
const MACROS_KEY = 'lares4.license.macros';
const TABS_KEY = 'lares4.license.tabs';
const BUNDLE_KEY = 'lares4.license.bundle';

const PRIV = new Uint8Array(32);
const PUB_HEX_PROMISE = getPublicKeyAsync(PRIV).then((p) =>
  Array.from(p, (b) => b.toString(16).padStart(2, '0')).join(''),
);

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/=+$/u, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function mintToken(feature: 'macros' | 'tabs' | 'triggers' | 'annotations' | '*'): Promise<string> {
  const payload = {
    v: 1,
    f: feature,
    sub: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
  };
  const payloadEnc = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await signAsync(new TextEncoder().encode(payloadEnc), PRIV);
  return `LARES4-${payloadEnc}.${base64UrlEncode(sig)}`;
}

function installStubStorage(): Map<string, string> {
  const mem = new Map<string, string>();
  const storage = {
    getItem(k: string): string | null { return mem.get(k) ?? null; },
    setItem(k: string, v: string): void { mem.set(k, v); },
    removeItem(k: string): void { mem.delete(k); },
    clear(): void { mem.clear(); },
    key(): string | null { return null; },
    get length(): number { return mem.size; },
  };
  (globalThis as MutableGlobal).window = { localStorage: storage };
  return mem;
}

function clearStubStorage(): void {
  delete (globalThis as MutableGlobal).window;
}

async function loadFresh(): Promise<typeof import('../src/desktop/runtime/commercial-license-prefs.js')> {
  process.env.LARES4_LICENSE_PUBKEY = await PUB_HEX_PROMISE;
  const verify = await import('../src/desktop/runtime/license-verify.js');
  verify.__clearVerifyCacheForTests();
  const url = `../src/desktop/runtime/commercial-license-prefs.js?v=${Math.random()}`;
  return import(url);
}

describe('commercial-license-prefs', () => {
  let mem: Map<string, string>;

  beforeEach(() => {
    mem = installStubStorage();
  });

  afterEach(() => {
    clearStubStorage();
  });

  describe('raw storage', () => {
    it('round-trips a feature key (trimmed)', async () => {
      const mod = await loadFresh();
      mod.setFeatureLicense('macros', '  TOKEN  ');
      assert.equal(mem.get(MACROS_KEY), 'TOKEN');
      assert.equal(mod.getFeatureLicense('macros'), 'TOKEN');
    });

    it('clears the key when set to null or whitespace', async () => {
      const mod = await loadFresh();
      mod.setFeatureLicense('macros', 'TOKEN');
      mod.setFeatureLicense('macros', null);
      assert.equal(mem.has(MACROS_KEY), false);
      mod.setFeatureLicense('macros', '   ');
      assert.equal(mem.has(MACROS_KEY), false);
    });
  });

  describe('isFeatureLicensed gating', () => {
    it('returns false for an unverified raw string', async () => {
      const mod = await loadFresh();
      mod.setFeatureLicense('macros', 'not-a-signed-token');
      assert.equal(mod.isFeatureLicensed('macros'), false);
    });

    it('grants the feature after verifyAndSaveFeatureLicense succeeds', async () => {
      const mod = await loadFresh();
      const token = await mintToken('macros');
      const result = await mod.verifyAndSaveFeatureLicense('macros', token);
      assert.equal(result.ok, true);
      assert.equal(mod.isFeatureLicensed('macros'), true);
      assert.equal(mod.isFeatureLicensed('tabs'), false);
      assert.equal(mem.get(MACROS_KEY), token);
    });

    it('rejects a wrong-feature token and does not persist it', async () => {
      const mod = await loadFresh();
      const token = await mintToken('tabs');
      const result = await mod.verifyAndSaveFeatureLicense('macros', token);
      assert.equal(result.ok, false);
      assert.equal(mod.isFeatureLicensed('macros'), false);
      assert.equal(mem.has(MACROS_KEY), false);
    });

    it('stores a bundle token under the bundle key and unlocks every feature', async () => {
      const mod = await loadFresh();
      const token = await mintToken('*');
      const result = await mod.verifyAndSaveFeatureLicense('macros', token);
      assert.equal(result.ok, true);
      assert.equal(mem.get(BUNDLE_KEY), token);
      assert.equal(mem.has(MACROS_KEY), false);
      for (const id of ['macros', 'tabs', 'triggers', 'annotations'] as const) {
        assert.equal(mod.isFeatureLicensed(id), true, `bundle should unlock ${id}`);
      }
    });
  });

  describe('bootstrapLicenses', () => {
    it('re-verifies stored tokens on app load', async () => {
      const token = await mintToken('tabs');
      const mod = await loadFresh();
      // Simulate state already on disk from a prior session.
      mem.set(TABS_KEY, token);
      assert.equal(mod.isFeatureLicensed('tabs'), false);
      await mod.bootstrapLicenses();
      assert.equal(mod.isFeatureLicensed('tabs'), true);
    });

    it('does not grant features for tampered stored tokens', async () => {
      const mod = await loadFresh();
      mem.set(MACROS_KEY, 'LARES4-AAAA.BBBB');
      await mod.bootstrapLicenses();
      assert.equal(mod.isFeatureLicensed('macros'), false);
    });
  });

  describe('legacy macros key migration', () => {
    it('reads legacy key as a fallback raw value for macros', async () => {
      const mod = await loadFresh();
      mem.set(LEGACY_KEY, 'LEGACY-RAW');
      assert.equal(mod.getFeatureLicense('macros'), 'LEGACY-RAW');
    });

    it('does not surface the legacy key for tabs', async () => {
      const mod = await loadFresh();
      mem.set(LEGACY_KEY, 'LEGACY-RAW');
      assert.equal(mod.getFeatureLicense('tabs'), null);
    });

    it('clears the legacy key on the first macros write', async () => {
      const mod = await loadFresh();
      mem.set(LEGACY_KEY, 'LEGACY-RAW');
      mod.setFeatureLicense('macros', 'NEW-RAW');
      assert.equal(mem.has(LEGACY_KEY), false);
      assert.equal(mem.get(MACROS_KEY), 'NEW-RAW');
    });

    it('clears legacy key when macros license is cleared', async () => {
      const mod = await loadFresh();
      mem.set(LEGACY_KEY, 'LEGACY-RAW');
      mod.setFeatureLicense('macros', null);
      assert.equal(mem.has(LEGACY_KEY), false);
      assert.equal(mem.has(MACROS_KEY), false);
    });
  });

  describe('descriptors', () => {
    it('exposes feature descriptors with storage keys and copy', async () => {
      const { FEATURES } = await loadFresh();
      assert.equal(FEATURES.macros.storageKey, MACROS_KEY);
      assert.equal(FEATURES.tabs.storageKey, TABS_KEY);
      assert.ok(FEATURES.macros.title.length > 0);
      assert.ok(FEATURES.tabs.description.length > 0);
    });
  });
});
