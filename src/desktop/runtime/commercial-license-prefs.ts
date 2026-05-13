import {
  peekVerifyResult,
  dropVerifyCache,
  verifyLicense,
  type LicensePayload,
  type LicenseVerifyResult,
} from './license-verify.js';

const LEGACY_STORAGE_KEY = 'lares4.commercialLicense';
const BUNDLE_STORAGE_KEY = 'lares4.license.bundle';

export type FeatureId = 'macros' | 'tabs' | 'triggers' | 'annotations';

export const FEATURE_IDS: readonly FeatureId[] = ['macros', 'tabs', 'triggers', 'annotations'];

export interface FeatureDescriptor {
  id: FeatureId;
  storageKey: string;
  title: string;
  description: string;
}

export const FEATURES: Record<FeatureId, FeatureDescriptor> = {
  macros: {
    id: 'macros',
    storageKey: 'lares4.license.macros',
    title: 'Macros commercial license',
    description:
      'Macros are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to unlock.',
  },
  tabs: {
    id: 'tabs',
    storageKey: 'lares4.license.tabs',
    title: 'Tabs commercial license',
    description:
      'Multi-connection tabs are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to unlock additional tabs.',
  },
  triggers: {
    id: 'triggers',
    storageKey: 'lares4.license.triggers',
    title: 'Triggers commercial license',
    description:
      'Trigger rules are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to enable rule editing and live evaluation.',
  },
  annotations: {
    id: 'annotations',
    storageKey: 'lares4.license.annotations',
    title: 'Pin & bookmarks commercial license',
    description:
      'Pin and bookmarks are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to enable pinning, bookmarking, notes, and export.',
  },
};

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readKey(storage: Storage, key: string): string | null {
  try {
    const v = storage.getItem(key);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Raw stored token for a feature, ignoring legacy and bundle. */
function getFeatureRaw(id: FeatureId): string | null {
  const storage = getStorage();
  if (!storage) return null;
  const direct = readKey(storage, FEATURES[id].storageKey);
  if (direct !== null) return direct;
  if (id === 'macros') {
    return readKey(storage, LEGACY_STORAGE_KEY);
  }
  return null;
}

export function getBundleRaw(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  return readKey(storage, BUNDLE_STORAGE_KEY);
}

export function getFeatureLicense(id: FeatureId): string | null {
  return getFeatureRaw(id);
}

/** Persist a raw token under a feature's storage key (no validation). */
export function setFeatureLicense(id: FeatureId, key: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  const descriptor = FEATURES[id];
  try {
    const trimmed = key?.trim() ?? '';
    const existing = readKey(storage, descriptor.storageKey);
    if (existing) dropVerifyCache(existing);
    if (trimmed.length > 0) {
      storage.setItem(descriptor.storageKey, trimmed);
    } else {
      storage.removeItem(descriptor.storageKey);
    }
    if (id === 'macros') {
      const legacy = readKey(storage, LEGACY_STORAGE_KEY);
      if (legacy) dropVerifyCache(legacy);
      storage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Persist a raw bundle (`f: "*"`) token. */
export function setBundleLicense(key: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const trimmed = key?.trim() ?? '';
    const existing = readKey(storage, BUNDLE_STORAGE_KEY);
    if (existing) dropVerifyCache(existing);
    if (trimmed.length > 0) {
      storage.setItem(BUNDLE_STORAGE_KEY, trimmed);
    } else {
      storage.removeItem(BUNDLE_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function cachedResult(raw: string | null): LicenseVerifyResult | undefined {
  return peekVerifyResult(raw);
}

/** Synchronous check — relies on the in-process verify cache. */
export function isFeatureLicensed(id: FeatureId): boolean {
  const bundle = cachedResult(getBundleRaw());
  if (bundle?.ok && bundle.payload.f === '*' && isNotExpired(bundle.payload)) {
    return true;
  }
  const direct = cachedResult(getFeatureRaw(id));
  if (direct?.ok && (direct.payload.f === id || direct.payload.f === '*') && isNotExpired(direct.payload)) {
    return true;
  }
  return false;
}

/** Verified payload for a feature, if available in cache. */
export function getFeatureLicensePayload(id: FeatureId): LicensePayload | null {
  const bundle = cachedResult(getBundleRaw());
  if (bundle?.ok && bundle.payload.f === '*' && isNotExpired(bundle.payload)) {
    return bundle.payload;
  }
  const direct = cachedResult(getFeatureRaw(id));
  if (direct?.ok && (direct.payload.f === id || direct.payload.f === '*') && isNotExpired(direct.payload)) {
    return direct.payload;
  }
  return null;
}

function isNotExpired(p: LicensePayload): boolean {
  return p.exp === undefined || p.exp * 1000 > Date.now();
}

/**
 * Verify every stored token once (signature + structure + claim).
 * After this resolves, `isFeatureLicensed` is reliable for the lifetime
 * of the page. Saves go through `verifyAndSaveFeatureLicense` which keeps
 * the cache hot.
 */
export async function bootstrapLicenses(): Promise<void> {
  const bundle = getBundleRaw();
  if (bundle) {
    // Verify against any feature — bundle accepts all.
    await verifyLicense(bundle, 'macros');
  }
  await Promise.all(
    FEATURE_IDS.map(async (id) => {
      const raw = getFeatureRaw(id);
      if (raw) await verifyLicense(raw, id);
    }),
  );
}

/**
 * Verify a candidate token against a target feature. If verification passes:
 *   - tokens with `f: "*"` are stored under the bundle key (and any prior
 *     feature key for `featureId` is cleared);
 *   - tokens with `f: featureId` are stored under that feature's key.
 * Returns the structured verify result without mutating storage on failure.
 */
export async function verifyAndSaveFeatureLicense(
  featureId: FeatureId,
  raw: string,
): Promise<LicenseVerifyResult> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'malformed-structure' };
  }
  const result = await verifyLicense(trimmed, featureId);
  if (!result.ok) return result;
  if (result.payload.f === '*') {
    setBundleLicense(trimmed);
    setFeatureLicense(featureId, null);
  } else {
    setFeatureLicense(featureId, trimmed);
  }
  return result;
}

// Back-compat thin wrappers for callers still using the macros-only shape.
export function getCommercialLicense(): string | null {
  return getFeatureLicense('macros');
}

export function setCommercialLicense(key: string | null): void {
  setFeatureLicense('macros', key);
}

export function isCommercialLicensed(): boolean {
  return isFeatureLicensed('macros');
}
