const STORAGE_KEY = 'lares4.readOnlyMode';

type Listener = (value: boolean) => void;
const listeners = new Set<Listener>();

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function isReadOnlyMode(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setReadOnlyMode(value: boolean): void {
  const storage = getStorage();
  if (storage) {
    try {
      if (value) storage.setItem(STORAGE_KEY, '1');
      else storage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  for (const listener of listeners) listener(value);
}

export function subscribeReadOnlyMode(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
