import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

interface MutableGlobal {
  window?: unknown;
}

const LEGACY_KEY = 'lares4.commercialLicense';
const MACROS_KEY = 'lares4.license.macros';
const TABS_KEY = 'lares4.license.tabs';

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

describe('commercial-license-prefs', () => {
  let mem: Map<string, string>;

  beforeEach(() => {
    mem = installStubStorage();
  });

  afterEach(() => {
    clearStubStorage();
  });

  describe('legacy macros API', () => {
    it('returns null when no license is stored', async () => {
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      assert.equal(mod.getCommercialLicense(), null);
      assert.equal(mod.isCommercialLicensed(), false);
    });

    it('stores a trimmed key under the macros feature key', async () => {
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      mod.setCommercialLicense('  ABC-123  ');
      assert.equal(mem.get(MACROS_KEY), 'ABC-123');
      assert.equal(mem.has(LEGACY_KEY), false);
      assert.equal(mod.getCommercialLicense(), 'ABC-123');
      assert.equal(mod.isCommercialLicensed(), true);
    });

    it('clears the license when set to null or empty', async () => {
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      mod.setCommercialLicense('XYZ');
      mod.setCommercialLicense(null);
      assert.equal(mem.has(MACROS_KEY), false);
      assert.equal(mod.isCommercialLicensed(), false);

      mod.setCommercialLicense('ABC');
      mod.setCommercialLicense('   ');
      assert.equal(mem.has(MACROS_KEY), false);
    });
  });

  describe('per-feature API', () => {
    it('tracks macros and tabs licenses independently', async () => {
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      assert.equal(mod.isFeatureLicensed('macros'), false);
      assert.equal(mod.isFeatureLicensed('tabs'), false);

      mod.setFeatureLicense('macros', 'MAC-1');
      assert.equal(mod.isFeatureLicensed('macros'), true);
      assert.equal(mod.isFeatureLicensed('tabs'), false);
      assert.equal(mem.get(MACROS_KEY), 'MAC-1');

      mod.setFeatureLicense('tabs', 'TAB-1');
      assert.equal(mod.isFeatureLicensed('tabs'), true);
      assert.equal(mem.get(TABS_KEY), 'TAB-1');
      assert.equal(mem.get(MACROS_KEY), 'MAC-1');

      mod.setFeatureLicense('macros', null);
      assert.equal(mod.isFeatureLicensed('macros'), false);
      assert.equal(mod.isFeatureLicensed('tabs'), true);
    });

    it('trims keys and stores under the feature storageKey', async () => {
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      mod.setFeatureLicense('tabs', '  XYZ  ');
      assert.equal(mem.get(TABS_KEY), 'XYZ');
      assert.equal(mod.getFeatureLicense('tabs'), 'XYZ');
    });

    it('exposes descriptor metadata for the dialog', async () => {
      const { FEATURES } = await import('../src/desktop/runtime/commercial-license-prefs.js');
      assert.equal(FEATURES.macros.storageKey, MACROS_KEY);
      assert.equal(FEATURES.tabs.storageKey, TABS_KEY);
      assert.ok(FEATURES.macros.title.length > 0);
      assert.ok(FEATURES.tabs.description.length > 0);
    });
  });

  describe('legacy macros key migration', () => {
    it('reads legacy lares4.commercialLicense as fallback for macros', async () => {
      mem.set(LEGACY_KEY, 'LEGACY-KEY');
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      assert.equal(mod.getFeatureLicense('macros'), 'LEGACY-KEY');
      assert.equal(mod.isCommercialLicensed(), true);
    });

    it('does not surface the legacy key for tabs', async () => {
      mem.set(LEGACY_KEY, 'LEGACY-KEY');
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      assert.equal(mod.getFeatureLicense('tabs'), null);
      assert.equal(mod.isFeatureLicensed('tabs'), false);
    });

    it('migrates the legacy key out on first macros write', async () => {
      mem.set(LEGACY_KEY, 'LEGACY-KEY');
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      mod.setFeatureLicense('macros', 'NEW-KEY');
      assert.equal(mem.has(LEGACY_KEY), false);
      assert.equal(mem.get(MACROS_KEY), 'NEW-KEY');
    });

    it('clears legacy key when macros license is cleared', async () => {
      mem.set(LEGACY_KEY, 'LEGACY-KEY');
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      mod.setFeatureLicense('macros', null);
      assert.equal(mem.has(LEGACY_KEY), false);
      assert.equal(mem.has(MACROS_KEY), false);
    });

    it('prefers a present new key over the legacy fallback', async () => {
      mem.set(LEGACY_KEY, 'LEGACY-KEY');
      mem.set(MACROS_KEY, 'NEW-KEY');
      const mod = await import('../src/desktop/runtime/commercial-license-prefs.js');
      assert.equal(mod.getFeatureLicense('macros'), 'NEW-KEY');
    });
  });
});
