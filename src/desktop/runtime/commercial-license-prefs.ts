import {
  peekVerifyResult,
  dropVerifyCache,
  verifyLicense,
  type LicensePayload,
  type LicenseVerifyResult,
} from './license-verify.js';
import { getLicenseTransport } from './license-transport.js';

export type FeatureId = 'macros' | 'tabs' | 'triggers' | 'annotations' | 'multiwindow' | 'sessions';

export const FEATURE_IDS: readonly FeatureId[] = ['macros', 'tabs', 'triggers', 'annotations', 'multiwindow', 'sessions'];

export interface FeatureDescriptor {
  id: FeatureId;
  title: string;
  description: string;
}

export const FEATURES: Record<FeatureId, FeatureDescriptor> = {
  macros: {
    id: 'macros',
    title: 'Macros commercial license',
    description:
      'Macros are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to unlock.',
  },
  tabs: {
    id: 'tabs',
    title: 'Tabs commercial license',
    description:
      'Multi-connection tabs are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to unlock additional tabs.',
  },
  triggers: {
    id: 'triggers',
    title: 'Triggers commercial license',
    description:
      'Trigger rules are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to enable rule editing and live evaluation.',
  },
  annotations: {
    id: 'annotations',
    title: 'Pin & bookmarks commercial license',
    description:
      'Pin and bookmarks are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to enable pinning, bookmarking, notes, and export.',
  },
  multiwindow: {
    id: 'multiwindow',
    title: 'Multi-window commercial license',
    description:
      'Multi-window is licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to open additional console windows, each with an independent connection.',
  },
  sessions: {
    id: 'sessions',
    title: 'Session history commercial license',
    description:
      'Session history is licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — paste your signed key below to persist sessions to SQLite and reopen recent sessions read-only.',
  },
};

// In-memory mirror of the keychain. Populated by `bootstrapLicenses` and kept
// in sync by save/clear paths. Keys: 'bundle', 'macros', 'tabs', 'triggers',
// 'annotations', 'multiwindow'.
const tokenStore = new Map<string, string>();

const LEGACY_LOCALSTORAGE_KEYS: Readonly<Record<FeatureId | 'bundle', string>> = {
  bundle: 'lares4.license.bundle',
  macros: 'lares4.license.macros',
  tabs: 'lares4.license.tabs',
  triggers: 'lares4.license.triggers',
  annotations: 'lares4.license.annotations',
  multiwindow: 'lares4.license.multiwindow',
  sessions: 'lares4.license.sessions',
};
const LEGACY_COMMERCIAL_KEY = 'lares4.commercialLicense';
const MIGRATED_MARKER = '_migrated';

let bootstrapped = false;
let warnedUnbootstrapped = false;

function warnUnboostrapped(): void {
  if (!bootstrapped && !warnedUnbootstrapped) {
    warnedUnbootstrapped = true;
    console.warn('[license] isFeatureLicensed called before bootstrapLicenses resolved');
  }
}

const licenseListeners = new Set<() => void>();
const inFlightVerify = new Set<string>();

/**
 * Subscribe to license-state changes (bootstrap finish, save, clear, and
 * lazy-verify completions). If bootstrap has already finished by the time the
 * caller subscribes, the listener is invoked once on the next microtask so the
 * caller gets a chance to re-snapshot — this handles the race where the
 * controllers attach AFTER bootstrap's broadcast has already gone out.
 */
export function subscribeLicenseChange(listener: () => void): () => void {
  licenseListeners.add(listener);
  if (bootstrapped) {
    queueMicrotask(() => {
      if (licenseListeners.has(listener)) listener();
    });
  }
  return () => licenseListeners.delete(listener);
}

function notifyLicenseChange(): void {
  for (const listener of licenseListeners) {
    try {
      listener();
    } catch {
      /* one bad listener must not kill the others */
    }
  }
}

/**
 * Fire-and-forget verify for a known raw token whose payload isn't in the
 * cache. Used by `isFeatureLicensed` to self-heal when `bootstrapLicenses`
 * silently failed (e.g. Tauri IPC wasn't ready in the first frames). On
 * success, broadcasts a license-change so subscribers re-snapshot.
 */
function lazyEnsureVerified(raw: string, probe: FeatureId): void {
  if (inFlightVerify.has(raw)) return;
  if (peekVerifyResult(raw)) return;
  inFlightVerify.add(raw);
  verifyLicense(raw, probe)
    .then((res) => {
      if (res.ok) notifyLicenseChange();
    })
    .catch((err) => {
      console.warn('[license] lazy verify failed:', err);
    })
    .finally(() => {
      inFlightVerify.delete(raw);
    });
}

function getFeatureRaw(id: FeatureId): string | null {
  return tokenStore.get(id) ?? null;
}

export function getBundleRaw(): string | null {
  return tokenStore.get('bundle') ?? null;
}

export function getFeatureLicense(id: FeatureId): string | null {
  return getFeatureRaw(id);
}

/**
 * Persist a raw token under a feature's slot. Use `verifyAndSaveFeatureLicense`
 * for new tokens — this entry point exists for the "clear" case (null) and
 * for low-level callers that already hold a verified token. Raw saves go to
 * the keychain via the active transport (fire-and-forget); the in-memory
 * mirror updates synchronously.
 */
export function setFeatureLicense(id: FeatureId, key: string | null): void {
  const transport = getLicenseTransport();
  const trimmed = key?.trim() ?? '';
  const existing = tokenStore.get(id);
  if (existing) dropVerifyCache(existing);
  if (trimmed.length > 0) {
    tokenStore.set(id, trimmed);
    void transport.save(id, trimmed).catch(() => undefined);
  } else {
    tokenStore.delete(id);
    void transport.clear(id).catch(() => undefined);
  }
  notifyLicenseChange();
}

/** Persist a raw bundle (`f: "*"`) token. */
export function setBundleLicense(key: string | null): void {
  const transport = getLicenseTransport();
  const trimmed = key?.trim() ?? '';
  const existing = tokenStore.get('bundle');
  if (existing) dropVerifyCache(existing);
  if (trimmed.length > 0) {
    tokenStore.set('bundle', trimmed);
    void transport.save('bundle', trimmed).catch(() => undefined);
  } else {
    tokenStore.delete('bundle');
    void transport.clear('bundle').catch(() => undefined);
  }
  notifyLicenseChange();
}

function isNotExpired(p: LicensePayload): boolean {
  return p.exp === undefined || p.exp * 1000 > Date.now();
}

function cachedResult(raw: string | null): LicenseVerifyResult | undefined {
  return peekVerifyResult(raw);
}

/** Synchronous check — relies on the in-process verify cache. */
export function isFeatureLicensed(id: FeatureId): boolean {
  warnUnboostrapped();
  const bundle = cachedResult(getBundleRaw());
  if (bundle?.ok && bundle.payload.f === '*' && isNotExpired(bundle.payload)) {
    return true;
  }
  const direct = cachedResult(getFeatureRaw(id));
  if (direct?.ok && (direct.payload.f === id || direct.payload.f === '*') && isNotExpired(direct.payload)) {
    return true;
  }
  // Cache miss but a token exists in the mirror — bootstrap may have silently
  // failed (Tauri IPC not ready, HMR, etc.). Kick off a background verify so
  // the next render after it resolves sees the populated cache. This call
  // still returns false synchronously; the broadcast does the unlock.
  const bundleRaw = getBundleRaw();
  if (bundleRaw) lazyEnsureVerified(bundleRaw, 'macros');
  const directRaw = getFeatureRaw(id);
  if (directRaw) lazyEnsureVerified(directRaw, id);
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

function getLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

async function migrateFromLocalStorageOnce(alreadyMigrated: boolean): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) return;
  if (alreadyMigrated) return;

  const transport = getLicenseTransport();
  const candidates: Array<{ id: FeatureId | 'bundle'; raw: string; lsKey: string }> = [];

  for (const [slot, lsKey] of Object.entries(LEGACY_LOCALSTORAGE_KEYS) as [FeatureId | 'bundle', string][]) {
    const v = storage.getItem(lsKey);
    if (v && v.length > 0) candidates.push({ id: slot, raw: v, lsKey });
  }
  // Legacy single-key macros storage.
  const legacy = storage.getItem(LEGACY_COMMERCIAL_KEY);
  if (legacy && legacy.length > 0 && !candidates.some((c) => c.id === 'macros')) {
    candidates.push({ id: 'macros', raw: legacy, lsKey: LEGACY_COMMERCIAL_KEY });
  }

  for (const { id, raw, lsKey } of candidates) {
    try {
      const res = await transport.save(id, raw);
      if (res.ok) {
        // Sync the mirror with what Rust persisted. Bundle tokens land in the
        // bundle slot regardless of how they were keyed in localStorage.
        if (res.payload.f === '*') {
          tokenStore.set('bundle', raw);
          if (id !== 'bundle') tokenStore.delete(id);
        } else {
          tokenStore.set(id, raw);
        }
        storage.removeItem(lsKey);
      }
    } catch {
      // Skip silently; we'll still set the marker so we don't retry forever.
    }
  }

  // Always remove the legacy single-key entry — even if it was invalid.
  storage.removeItem(LEGACY_COMMERCIAL_KEY);

  try {
    await transport.completeMigration();
  } catch {
    /* ignore */
  }
}

/**
 * Verify every stored token once (signature + structure + claim) so the
 * synchronous `isFeatureLicensed` / `getFeatureLicensePayload` accessors are
 * reliable for the lifetime of the page. Also runs the one-shot migration
 * from the old `window.localStorage` slots into the keychain.
 */
export async function bootstrapLicenses(): Promise<void> {
  const transport = getLicenseTransport();
  let stored: Record<string, string> = {};
  try {
    stored = await transport.readAll();
  } catch (err) {
    console.warn('[license] keychain readAll failed:', err);
  }
  const alreadyMigrated = stored[MIGRATED_MARKER] === '1' || stored[MIGRATED_MARKER] === 'true';
  for (const [slot, raw] of Object.entries(stored)) {
    if (slot === MIGRATED_MARKER) continue;
    tokenStore.set(slot, raw);
  }
  await Promise.all(
    Array.from(tokenStore.entries()).map(([slot, raw]) =>
      verifyLicense(raw, slot === 'bundle' ? 'macros' : (slot as FeatureId)).catch((err) => {
        console.warn(`[license] verify failed during bootstrap (slot=${slot}):`, err);
      }),
    ),
  );
  await migrateFromLocalStorageOnce(alreadyMigrated);
  // Reverify any tokens introduced by the migration step.
  await Promise.all(
    Array.from(tokenStore.entries()).map(([slot, raw]) =>
      verifyLicense(raw, slot === 'bundle' ? 'macros' : (slot as FeatureId)).catch((err) => {
        console.warn(`[license] re-verify failed during bootstrap (slot=${slot}):`, err);
      }),
    ),
  );
  bootstrapped = true;
  notifyLicenseChange();
}

/**
 * Verify a candidate token against a target feature. If verification passes:
 *   - tokens with `f: "*"` are stored under the bundle slot (and any prior
 *     per-feature slot for `featureId` is cleared);
 *   - tokens with `f: featureId` are stored under that feature's slot.
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
  const transport = getLicenseTransport();
  let result: LicenseVerifyResult;
  try {
    result = await transport.save(featureId, trimmed);
  } catch {
    return { ok: false, reason: 'storage-failed' };
  }
  if (!result.ok) return result;
  if (result.payload.f === '*') {
    const previousFeature = tokenStore.get(featureId);
    if (previousFeature) dropVerifyCache(previousFeature);
    tokenStore.set('bundle', trimmed);
    tokenStore.delete(featureId);
  } else {
    const previous = tokenStore.get(featureId);
    if (previous && previous !== trimmed) dropVerifyCache(previous);
    tokenStore.set(featureId, trimmed);
  }
  // Prime the verify cache so the sync accessors see the new payload.
  await verifyLicense(trimmed, featureId);
  notifyLicenseChange();
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

/** Test-only: wipe the in-memory mirror so the next test starts clean. */
export function __resetTokenStoreForTests(): void {
  tokenStore.clear();
  bootstrapped = false;
  warnedUnbootstrapped = false;
  licenseListeners.clear();
  inFlightVerify.clear();
}
