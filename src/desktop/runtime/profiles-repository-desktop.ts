import * as v from 'valibot';
import { quarantineProfilesFile, readProfilesFile, writeProfilesFile } from './tauri-fs.js';
import {
  ConnectionProfileSchema,
  ProfilesFileSchema,
  emptyProfilesFile,
  quarantineSuffix,
  type ConnectionProfile,
  type LoadError,
  type ProfilesFile,
} from '../../core/profiles-schema.js';
import type { LogTag } from '../../core/types.js';
import type { Macro } from '@pro/macros/types.js';
import type { TriggerRule } from '@pro/triggers/types.js';

export type { ConnectionProfile, ProfilesFile, LoadError };

export interface ProfilesPersistence {
  read: () => Promise<string | null>;
  write: (content: string) => Promise<void>;
  quarantine?: (suffix: string) => Promise<string>;
}

const defaultPersistence: ProfilesPersistence = {
  read: readProfilesFile,
  write: writeProfilesFile,
  quarantine: quarantineProfilesFile,
};

export type ProfilesFileWithLoadError = ProfilesFile & { loadError?: LoadError };

function nowIso(): string {
  return new Date().toISOString();
}

export class DesktopProfilesRepository {
  constructor(private readonly persistence: ProfilesPersistence = defaultPersistence) {}

  async readAll(): Promise<ProfilesFileWithLoadError> {
    const raw = await this.persistence.read();
    if (!raw) return emptyProfilesFile();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return await this.handleCorrupt(`Profiles file unreadable: ${detail}`);
    }

    const result = v.safeParse(ProfilesFileSchema, parsed);
    if (!result.success) {
      const detail = v.summarize(result.issues);
      return await this.handleCorrupt(`Profiles file schema mismatch: ${detail}`);
    }
    return result.output;
  }

  private async handleCorrupt(reason: string): Promise<ProfilesFileWithLoadError> {
    let quarantinedTo: string | undefined;
    if (this.persistence.quarantine) {
      try {
        const renamed = await this.persistence.quarantine(quarantineSuffix());
        if (renamed) quarantinedTo = renamed;
      } catch {
        // Quarantine itself failed (e.g. file already gone). Surface the original
        // schema/parse error without the quarantinedTo hint — app still boots.
      }
    }
    return { ...emptyProfilesFile(), loadError: { reason, quarantinedTo } };
  }

  private async writeAll(data: ProfilesFile): Promise<void> {
    await this.persistence.write(`${JSON.stringify(data, null, 2)}\n`);
  }

  async get(name: string): Promise<ConnectionProfile | undefined> {
    const data = await this.readAll();
    return data.profiles.find((p) => p.name === name);
  }

  async upsert(input: {
    name: string;
    ip: string;
    pin: string;
    wss: boolean;
    sender: string;
    makeDefault?: boolean;
    logTagFilters?: LogTag[];
    macros?: Macro[];
    triggers?: TriggerRule[];
    readOnly?: boolean;
  }): Promise<void> {
    const data = await this.readAll();
    const ts = nowIso();
    const idx = data.profiles.findIndex((p) => p.name === input.name);
    const prev = idx >= 0 ? data.profiles[idx] : undefined;
    const candidate: ConnectionProfile = {
      name: input.name,
      ip: input.ip,
      pin: input.pin,
      wss: input.wss,
      sender: input.sender,
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
      logTagFilters: input.logTagFilters !== undefined ? input.logTagFilters : prev?.logTagFilters,
      macros: input.macros !== undefined ? input.macros : prev?.macros,
      triggers: input.triggers !== undefined ? input.triggers : prev?.triggers,
      readOnly: input.readOnly !== undefined ? input.readOnly : prev?.readOnly,
    };
    const profile = v.parse(ConnectionProfileSchema, candidate);
    if (idx >= 0) data.profiles[idx] = profile;
    else data.profiles.push(profile);
    if (input.makeDefault || !data.defaultProfile) data.defaultProfile = input.name;
    await this.writeAll(stripLoadError(data));
  }

  async setTriggers(name: string, triggers: TriggerRule[]): Promise<void> {
    const data = await this.readAll();
    const idx = data.profiles.findIndex((p) => p.name === name);
    if (idx < 0) return;
    const prev = data.profiles[idx];
    const next = v.parse(ConnectionProfileSchema, { ...prev, triggers, updatedAt: nowIso() });
    data.profiles[idx] = next;
    await this.writeAll(stripLoadError(data));
  }

  async setLogTagFilters(name: string, filters: LogTag[] | undefined): Promise<void> {
    const data = await this.readAll();
    const idx = data.profiles.findIndex((p) => p.name === name);
    if (idx < 0) return;
    const prev = data.profiles[idx];
    const next = v.parse(ConnectionProfileSchema, { ...prev, logTagFilters: filters, updatedAt: nowIso() });
    data.profiles[idx] = next;
    await this.writeAll(stripLoadError(data));
  }

  async setMacros(name: string, macros: Macro[]): Promise<void> {
    const data = await this.readAll();
    const idx = data.profiles.findIndex((p) => p.name === name);
    if (idx < 0) return;
    const prev = data.profiles[idx];
    const next = v.parse(ConnectionProfileSchema, { ...prev, macros, updatedAt: nowIso() });
    data.profiles[idx] = next;
    await this.writeAll(stripLoadError(data));
  }

  async remove(name: string): Promise<void> {
    const data = await this.readAll();
    data.profiles = data.profiles.filter((p) => p.name !== name);
    if (data.defaultProfile === name) data.defaultProfile = data.profiles[0]?.name;
    await this.writeAll(stripLoadError(data));
  }

  async setDefault(name: string): Promise<void> {
    const data = await this.readAll();
    if (!data.profiles.some((p) => p.name === name)) return;
    data.defaultProfile = name;
    await this.writeAll(stripLoadError(data));
  }
}

function stripLoadError(data: ProfilesFileWithLoadError): ProfilesFile {
  return { version: 1, defaultProfile: data.defaultProfile, profiles: data.profiles };
}
