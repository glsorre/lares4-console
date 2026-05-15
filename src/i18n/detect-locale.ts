import { getStoredLanguage } from './language-prefs.js';
import { isSupportedLocale, type Locale } from './types.js';

async function readTauriLocale(): Promise<string | null> {
  try {
    const mod = await import('@tauri-apps/plugin-os');
    const raw = await mod.locale();
    return raw ?? null;
  } catch {
    return null;
  }
}

function readNavigatorLocale(): string | null {
  if (typeof navigator === 'undefined') return null;
  const lang = navigator.language;
  return typeof lang === 'string' && lang.length > 0 ? lang : null;
}

function normalize(raw: string | null): Locale | null {
  if (!raw) return null;
  const short = raw.slice(0, 2).toLowerCase();
  return isSupportedLocale(short) ? short : null;
}

export async function detectInitialLocale(): Promise<Locale> {
  const stored = getStoredLanguage();
  if (stored) return stored;
  const tauri = normalize(await readTauriLocale());
  if (tauri) return tauri;
  const nav = normalize(readNavigatorLocale());
  if (nav) return nav;
  return 'en';
}
