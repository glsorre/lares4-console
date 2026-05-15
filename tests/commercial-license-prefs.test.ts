import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getPublicKeyAsync, signAsync } from '@noble/ed25519';
import {
  __clearVerifyCacheForTests,
} from '../src/desktop/runtime/license-verify.js';
import {
  __resetTokenStoreForTests,
  bootstrapLicenses,
  FEATURES,
  getBundleRaw,
  getFeatureLicense,
  isFeatureLicensed,
  setBundleLicense,
  setFeatureLicense,
  subscribeLicenseChange,
  verifyAndSaveFeatureLicense,
} from '../src/desktop/runtime/commercial-license-prefs.js';
import { installFakeTransport } from './helpers/fake-license-transport.js';

interface MutableGlobal { window?: unknown }

const PRIV = new Uint8Array(32);
const PUB_HEX_PROMISE = getPublicKeyAsync(PRIV).then((p) =>
  Array.from(p, (b) => b.toString(16).padStart(2, '0')).join(''),
);

const LEGACY_MACROS_KEY = 'lares4.license.macros';
const LEGACY_TABS_KEY = 'lares4.license.tabs';
const LEGACY_BUNDLE_KEY = 'lares4.license.bundle';
const LEGACY_COMMERCIAL_KEY = 'lares4.commercialLicense';

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

function installStubLocalStorage(): Map<string, string> {
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

function clearStubLocalStorage(): void {
  delete (globalThis as MutableGlobal).window;
}

describe('commercial-license-prefs', () => {
  let fakeStore: Map<string, string>;
  let localMem: Map<string, string>;

  beforeEach(async () => {
    const pubHex = await PUB_HEX_PROMISE;
    fakeStore = installFakeTransport({ pubkeysHex: [pubHex] }).store;
    localMem = installStubLocalStorage();
    __clearVerifyCacheForTests();
    __resetTokenStoreForTests();
  });

  afterEach(() => {
    clearStubLocalStorage();
  });

  describe('raw storage', () => {
    it('round-trips a feature key (trimmed) into the keychain mirror', () => {
      setFeatureLicense('macros', '  TOKEN  ');
      assert.equal(getFeatureLicense('macros'), 'TOKEN');
    });

    it('clears the mirror when set to null or whitespace', () => {
      setFeatureLicense('macros', 'TOKEN');
      setFeatureLicense('macros', null);
      assert.equal(getFeatureLicense('macros'), null);
      setFeatureLicense('macros', '   ');
      assert.equal(getFeatureLicense('macros'), null);
    });
  });

  describe('isFeatureLicensed gating', () => {
    it('returns false for an unverified raw string', () => {
      setFeatureLicense('macros', 'not-a-signed-token');
      assert.equal(isFeatureLicensed('macros'), false);
    });

    it('grants the feature after verifyAndSaveFeatureLicense succeeds', async () => {
      const token = await mintToken('macros');
      const result = await verifyAndSaveFeatureLicense('macros', token);
      assert.equal(result.ok, true);
      assert.equal(isFeatureLicensed('macros'), true);
      assert.equal(isFeatureLicensed('tabs'), false);
      assert.equal(fakeStore.get('macros'), token);
    });

    it('rejects a wrong-feature token and does not persist it', async () => {
      const token = await mintToken('tabs');
      const result = await verifyAndSaveFeatureLicense('macros', token);
      assert.equal(result.ok, false);
      assert.equal(isFeatureLicensed('macros'), false);
      assert.equal(fakeStore.has('macros'), false);
    });

    it('stores a bundle token under the bundle slot and unlocks every feature', async () => {
      const token = await mintToken('*');
      const result = await verifyAndSaveFeatureLicense('macros', token);
      assert.equal(result.ok, true);
      assert.equal(fakeStore.get('bundle'), token);
      assert.equal(fakeStore.has('macros'), false);
      assert.equal(getBundleRaw(), token);
      for (const id of ['macros', 'tabs', 'triggers', 'annotations'] as const) {
        assert.equal(isFeatureLicensed(id), true, `bundle should unlock ${id}`);
      }
    });
  });

  describe('bootstrapLicenses', () => {
    it('re-verifies stored tokens on app load', async () => {
      const token = await mintToken('tabs');
      fakeStore.set('tabs', token);
      assert.equal(isFeatureLicensed('tabs'), false);
      await bootstrapLicenses();
      assert.equal(isFeatureLicensed('tabs'), true);
    });

    it('does not grant features for tampered stored tokens', async () => {
      fakeStore.set('macros', 'LARES4-AAAA.BBBB');
      await bootstrapLicenses();
      assert.equal(isFeatureLicensed('macros'), false);
    });

    it('keeps a tampered token in the mirror so callers can surface the reason', async () => {
      const tampered = 'LARES4-AAAA.BBBB';
      fakeStore.set('macros', tampered);
      await bootstrapLicenses();
      assert.equal(getFeatureLicense('macros'), tampered);
    });
  });

  describe('localStorage migration', () => {
    it('moves legacy per-feature tokens from localStorage into the keychain', async () => {
      const token = await mintToken('macros');
      localMem.set(LEGACY_MACROS_KEY, token);
      await bootstrapLicenses();
      assert.equal(fakeStore.get('macros'), token);
      assert.equal(localMem.has(LEGACY_MACROS_KEY), false);
      assert.equal(isFeatureLicensed('macros'), true);
    });

    it('routes a legacy bundle token into the bundle slot and unlocks every feature', async () => {
      const token = await mintToken('*');
      localMem.set(LEGACY_BUNDLE_KEY, token);
      await bootstrapLicenses();
      assert.equal(fakeStore.get('bundle'), token);
      assert.equal(localMem.has(LEGACY_BUNDLE_KEY), false);
      for (const id of ['macros', 'tabs', 'triggers', 'annotations'] as const) {
        assert.equal(isFeatureLicensed(id), true);
      }
    });

    it('migrates the legacy single-key commercial token as a macros entry', async () => {
      const token = await mintToken('macros');
      localMem.set(LEGACY_COMMERCIAL_KEY, token);
      await bootstrapLicenses();
      assert.equal(fakeStore.get('macros'), token);
      assert.equal(localMem.has(LEGACY_COMMERCIAL_KEY), false);
    });

    it('sets the _migrated marker so a second bootstrap skips migration', async () => {
      const token = await mintToken('tabs');
      localMem.set(LEGACY_TABS_KEY, token);
      await bootstrapLicenses();
      assert.equal(fakeStore.get('_migrated'), '1');
      // Seed another legacy key and re-bootstrap; should NOT migrate because marker is set.
      const second = await mintToken('macros');
      localMem.set(LEGACY_MACROS_KEY, second);
      __resetTokenStoreForTests();
      __clearVerifyCacheForTests();
      await bootstrapLicenses();
      assert.equal(localMem.has(LEGACY_MACROS_KEY), true);
      assert.equal(fakeStore.has('macros'), false);
    });
  });

  describe('descriptors', () => {
    it('exposes feature descriptors with copy', () => {
      assert.equal(FEATURES.macros.id, 'macros');
      assert.equal(FEATURES.tabs.id, 'tabs');
      assert.ok(FEATURES.macros.title.length > 0);
      assert.ok(FEATURES.tabs.description.length > 0);
    });
  });

  describe('setBundleLicense', () => {
    it('writes a bundle token straight into the mirror', () => {
      setBundleLicense('BUNDLE-RAW');
      assert.equal(getBundleRaw(), 'BUNDLE-RAW');
      setBundleLicense(null);
      assert.equal(getBundleRaw(), null);
    });
  });

  describe('subscribeLicenseChange replay + self-healing', () => {
    it('replays once on next microtask for subscribers that attach after bootstrap', async () => {
      const token = await mintToken('macros');
      fakeStore.set('macros', token);
      await bootstrapLicenses();
      let calls = 0;
      const unsub = subscribeLicenseChange(() => { calls += 1; });
      assert.equal(calls, 0, 'replay is async, not sync');
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      assert.equal(calls, 1, 'late subscriber gets exactly one replay');
      unsub();
    });

    it('does NOT replay for subscribers attached before bootstrap (they get the real notify)', async () => {
      const token = await mintToken('macros');
      fakeStore.set('macros', token);
      let calls = 0;
      const unsub = subscribeLicenseChange(() => { calls += 1; });
      await bootstrapLicenses();
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      unsub();
      assert.equal(calls, 1, 'early subscriber fires once via bootstrap notify, no replay');
    });

    it('isFeatureLicensed self-heals when bootstrap left the cache empty', async () => {
      // Simulate bootstrap-with-empty-cache: seed tokenStore directly, do NOT
      // call verifyLicense up front. `isFeatureLicensed` must kick off a
      // background verify and broadcast on success.
      const token = await mintToken('macros');
      fakeStore.set('macros', token);
      // Read keychain into tokenStore but skip the verify step that bootstrap
      // would normally do: that mirrors mode A (silent verify failure).
      const { setFeatureLicense } = await import(
        '../src/desktop/runtime/commercial-license-prefs.js'
      );
      setFeatureLicense('macros', token);
      __clearVerifyCacheForTests();
      // Now the cache is empty but the token is in the mirror.
      assert.equal(isFeatureLicensed('macros'), false);
      let notifies = 0;
      const unsub = subscribeLicenseChange(() => { notifies += 1; });
      // Trigger the lazy path.
      assert.equal(isFeatureLicensed('macros'), false);
      // Wait for the background verify to resolve.
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(isFeatureLicensed('macros'), true, 'cache populated by lazy verify');
      assert.ok(notifies >= 1, 'lazy verify broadcasts a license-change');
      unsub();
    });

    it('lazy verify is deduplicated per raw token', async () => {
      const token = await mintToken('macros');
      // Spy on transport.verify by wrapping.
      let verifyCalls = 0;
      const handle = installFakeTransport({ pubkeysHex: [await PUB_HEX_PROMISE] });
      const orig = handle.transport.verify.bind(handle.transport);
      handle.transport.verify = async (raw, featureId) => {
        verifyCalls += 1;
        return orig(raw, featureId);
      };
      // Re-install with the wrapped transport.
      const { __setLicenseTransport } = await import(
        '../src/desktop/runtime/license-transport.js'
      );
      __setLicenseTransport(handle.transport);
      const { setFeatureLicense } = await import(
        '../src/desktop/runtime/commercial-license-prefs.js'
      );
      setFeatureLicense('macros', token);
      __clearVerifyCacheForTests();
      // Burst-call isFeatureLicensed; only one in-flight verify should kick off.
      for (let i = 0; i < 5; i += 1) isFeatureLicensed('macros');
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(verifyCalls, 1, 'dedup: one in-flight verify per raw token');
    });
  });

  describe('subscribeLicenseChange', () => {
    it('fires on setFeatureLicense (set and clear)', () => {
      let calls = 0;
      const unsub = subscribeLicenseChange(() => { calls += 1; });
      setFeatureLicense('macros', 'RAW-A');
      setFeatureLicense('macros', null);
      unsub();
      setFeatureLicense('macros', 'RAW-B'); // post-unsub, must not count
      assert.equal(calls, 2);
    });

    it('fires on setBundleLicense (set and clear)', () => {
      let calls = 0;
      const unsub = subscribeLicenseChange(() => { calls += 1; });
      setBundleLicense('BUNDLE-RAW');
      setBundleLicense(null);
      unsub();
      assert.equal(calls, 2);
    });

    it('fires on verifyAndSaveFeatureLicense success', async () => {
      let calls = 0;
      const unsub = subscribeLicenseChange(() => { calls += 1; });
      const token = await mintToken('macros');
      const result = await verifyAndSaveFeatureLicense('macros', token);
      unsub();
      assert.equal(result.ok, true);
      assert.equal(calls, 1);
    });

    it('fires once at the tail of bootstrapLicenses', async () => {
      const token = await mintToken('tabs');
      fakeStore.set('tabs', token);
      let calls = 0;
      const unsub = subscribeLicenseChange(() => { calls += 1; });
      await bootstrapLicenses();
      unsub();
      assert.equal(calls, 1);
    });

    it('isolates failures in one listener from the others', () => {
      let good = 0;
      const unsubBad = subscribeLicenseChange(() => { throw new Error('boom'); });
      const unsubGood = subscribeLicenseChange(() => { good += 1; });
      setFeatureLicense('macros', 'RAW');
      unsubBad();
      unsubGood();
      assert.equal(good, 1);
    });
  });
});
