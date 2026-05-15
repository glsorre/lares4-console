import { isSupportedLocale, type Locale } from './types.js';

const STORAGE_KEY = 'lares4.language';

type Listener = (value: Locale) => void;
const listeners = new Set<Listener>();

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getStoredLanguage(): Locale | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return isSupportedLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setStoredLanguage(value: Locale): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }
  for (const listener of listeners) listener(value);
}

export function clearStoredLanguage(): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeStoredLanguage(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
