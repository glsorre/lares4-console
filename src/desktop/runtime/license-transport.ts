import type { LicenseVerifyResult } from './license-verify.js';

export interface LicenseTransport {
  verify(raw: string, featureId: string): Promise<LicenseVerifyResult>;
  save(featureId: string, raw: string): Promise<LicenseVerifyResult>;
  readAll(): Promise<Record<string, string>>;
  clear(featureId: string): Promise<void>;
  completeMigration(): Promise<void>;
}

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function loadInvoke(): Promise<InvokeFn> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke as InvokeFn;
}

function makeTauriTransport(): LicenseTransport {
  return {
    async verify(raw, featureId) {
      const invoke = await loadInvoke();
      return invoke<LicenseVerifyResult>('verify_license_token', { raw, featureId });
    },
    async save(featureId, raw) {
      const invoke = await loadInvoke();
      return invoke<LicenseVerifyResult>('save_license_token', { featureId, raw });
    },
    async readAll() {
      const invoke = await loadInvoke();
      return invoke<Record<string, string>>('read_all_licenses');
    },
    async clear(featureId) {
      const invoke = await loadInvoke();
      await invoke<void>('clear_license', { featureId });
    },
    async completeMigration() {
      const invoke = await loadInvoke();
      await invoke<void>('complete_license_migration');
    },
  };
}

let transport: LicenseTransport = makeTauriTransport();

export function getLicenseTransport(): LicenseTransport {
  return transport;
}

/** Test-only: replace the active transport (e.g., with an in-memory fake). */
export function __setLicenseTransport(next: LicenseTransport): void {
  transport = next;
}

/** Test-only: revert to the production Tauri-backed transport. */
export function __resetLicenseTransportForTests(): void {
  transport = makeTauriTransport();
}
