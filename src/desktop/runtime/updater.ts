export interface UpdateInfo {
  version: string;
  currentVersion?: string;
  date?: string;
  body?: string;
}

export type UpdateInstallProgress =
  | { phase: 'started'; total?: number }
  | { phase: 'progress'; downloaded: number; total?: number }
  | { phase: 'finished' };

export interface UpdaterAdapter {
  check: () => Promise<UpdateInfo | null>;
  install: (onProgress?: (e: UpdateInstallProgress) => void) => Promise<void>;
  restart: () => Promise<void>;
}

export type CheckOutcome =
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'up-to-date' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; info: UpdateInfo }
  | { phase: 'up-to-date' }
  | { phase: 'installing'; downloaded: number; total?: number }
  | { phase: 'installed' }
  | { phase: 'unsupported' }
  | { phase: 'error'; message: string };

export type UpdaterEvent =
  | { type: 'check-start' }
  | { type: 'check-result'; outcome: CheckOutcome }
  | { type: 'install-start' }
  | { type: 'install-progress'; downloaded: number; total?: number }
  | { type: 'install-done' }
  | { type: 'reset' };

export function nextUpdaterState(prev: UpdaterState, event: UpdaterEvent): UpdaterState {
  switch (event.type) {
    case 'check-start':
      return { phase: 'checking' };
    case 'check-result':
      switch (event.outcome.kind) {
        case 'available': return { phase: 'available', info: event.outcome.info };
        case 'up-to-date': return { phase: 'up-to-date' };
        case 'unsupported': return { phase: 'unsupported' };
        case 'error': return { phase: 'error', message: event.outcome.message };
      }
      return prev;
    case 'install-start':
      return { phase: 'installing', downloaded: 0, total: undefined };
    case 'install-progress':
      return { phase: 'installing', downloaded: event.downloaded, total: event.total };
    case 'install-done':
      return { phase: 'installed' };
    case 'reset':
      return { phase: 'idle' };
  }
}

export async function runCheck(adapter: UpdaterAdapter | null): Promise<CheckOutcome> {
  if (!adapter) return { kind: 'unsupported' };
  try {
    const info = await adapter.check();
    return info ? { kind: 'available', info } : { kind: 'up-to-date' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'error', message };
  }
}

async function loadTauriAdapter(): Promise<UpdaterAdapter | null> {
  try {
    const [{ check }, { relaunch }] = await Promise.all([
      import('@tauri-apps/plugin-updater'),
      import('@tauri-apps/plugin-process'),
    ]);
    let pending: Awaited<ReturnType<typeof check>> | null = null;
    return {
      check: async () => {
        pending = await check();
        if (!pending) return null;
        return {
          version: pending.version,
          currentVersion: pending.currentVersion,
          date: pending.date,
          body: pending.body,
        };
      },
      install: async (onProgress) => {
        if (!pending) throw new Error('No update available to install.');
        let downloaded = 0;
        let total: number | undefined;
        await pending.downloadAndInstall((event) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? undefined;
            onProgress?.({ phase: 'started', total });
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            onProgress?.({ phase: 'progress', downloaded, total });
          } else if (event.event === 'Finished') {
            onProgress?.({ phase: 'finished' });
          }
        });
      },
      restart: async () => { await relaunch(); },
    };
  } catch {
    return null;
  }
}

let adapterPromise: Promise<UpdaterAdapter | null> | undefined;

export function getUpdaterAdapter(): Promise<UpdaterAdapter | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const hasTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (!hasTauri) return Promise.resolve(null);
  adapterPromise ??= loadTauriAdapter();
  return adapterPromise;
}
