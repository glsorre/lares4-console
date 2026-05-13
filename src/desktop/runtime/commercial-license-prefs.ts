const LEGACY_STORAGE_KEY = 'lares4.commercialLicense';

export type FeatureId = 'macros' | 'tabs' | 'triggers' | 'annotations';

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
      'Macros are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — enter your key below to remove the noncommercial-use badge.',
  },
  tabs: {
    id: 'tabs',
    storageKey: 'lares4.license.tabs',
    title: 'Tabs commercial license',
    description:
      'Multi-connection tabs are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — enter your key below to unlock additional tabs.',
  },
  triggers: {
    id: 'triggers',
    storageKey: 'lares4.license.triggers',
    title: 'Triggers commercial license',
    description:
      'Trigger rules are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — enter your key below to enable rule editing and live evaluation.',
  },
  annotations: {
    id: 'annotations',
    storageKey: 'lares4.license.annotations',
    title: 'Pin & bookmarks commercial license',
    description:
      'Pin and bookmarks are licensed under PolyForm Noncommercial 1.0.0. Free for personal, educational, research, and noncommercial organization use. Commercial use requires a license — enter your key below to enable pinning, bookmarking, notes, and export.',
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

export function getFeatureLicense(id: FeatureId): string | null {
  const storage = getStorage();
  if (!storage) return null;
  const descriptor = FEATURES[id];
  const direct = readKey(storage, descriptor.storageKey);
  if (direct !== null) return direct;
  if (id === 'macros') {
    return readKey(storage, LEGACY_STORAGE_KEY);
  }
  return null;
}

export function setFeatureLicense(id: FeatureId, key: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  const descriptor = FEATURES[id];
  try {
    const trimmed = key?.trim() ?? '';
    if (trimmed.length > 0) {
      storage.setItem(descriptor.storageKey, trimmed);
    } else {
      storage.removeItem(descriptor.storageKey);
    }
    if (id === 'macros') {
      storage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function isFeatureLicensed(id: FeatureId): boolean {
  return getFeatureLicense(id) !== null;
}

export function getCommercialLicense(): string | null {
  return getFeatureLicense('macros');
}

export function setCommercialLicense(key: string | null): void {
  setFeatureLicense('macros', key);
}

export function isCommercialLicensed(): boolean {
  return isFeatureLicensed('macros');
}
