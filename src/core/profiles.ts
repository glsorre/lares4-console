import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import * as v from 'valibot';
import {
  ConnectionProfileSchema,
  ProfilesFileSchema,
  emptyProfilesFile,
  quarantineSuffix,
  type ConnectionProfile,
  type LoadError,
  type ProfilesFile,
} from './profiles-schema.js';

export type { ConnectionProfile, LoadError, ProfilesFile };

export type ProfilesFileWithLoadError = ProfilesFile & { loadError?: LoadError };

function nowIso(): string {
  return new Date().toISOString();
}

function defaultProfilesPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim().length > 0) {
    return resolve(xdg, 'lares4-console', 'profiles.json');
  }
  return join(homedir(), '.config', 'lares4-console', 'profiles.json');
}

export class ProfilesRepository {
  constructor(private readonly filePath: string = defaultProfilesPath()) {}

  get path(): string {
    return this.filePath;
  }

  async readAll(): Promise<ProfilesFileWithLoadError> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return emptyProfilesFile();
    }

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
    try {
      const suffix = quarantineSuffix();
      const targetName = `profiles.corrupt-${suffix}.json`;
      const target = join(dirname(this.filePath), targetName);
      await rename(this.filePath, target);
      quarantinedTo = targetName;
    } catch {
      // Quarantine failed (file already gone, etc.) — surface schema/parse error
      // without quarantinedTo so the caller still gets a non-fatal load result.
    }
    return { ...emptyProfilesFile(), loadError: { reason, quarantinedTo } };
  }

  private async writeAll(data: ProfilesFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  async list(): Promise<ConnectionProfile[]> {
    const data = await this.readAll();
    return [...data.profiles].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string): Promise<ConnectionProfile | undefined> {
    const data = await this.readAll();
    return data.profiles.find((p) => p.name === name);
  }

  async getDefault(): Promise<ConnectionProfile | undefined> {
    const data = await this.readAll();
    if (!data.defaultProfile) return undefined;
    return data.profiles.find((p) => p.name === data.defaultProfile);
  }

  async upsert(input: {
    name: string;
    ip: string;
    pin: string;
    wss: boolean;
    sender: string;
    makeDefault?: boolean;
  }): Promise<ConnectionProfile> {
    const data = await this.readAll();
    const ts = nowIso();
    const index = data.profiles.findIndex((p) => p.name === input.name);
    const prev = index >= 0 ? data.profiles[index] : undefined;
    const profile = v.parse(ConnectionProfileSchema, {
      name: input.name,
      ip: input.ip,
      pin: input.pin,
      wss: input.wss,
      sender: input.sender,
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
    });
    if (index >= 0) data.profiles[index] = profile;
    else data.profiles.push(profile);
    if (input.makeDefault || !data.defaultProfile) {
      data.defaultProfile = profile.name;
    }
    await this.writeAll(stripLoadError(data));
    return profile;
  }

  async remove(name: string): Promise<boolean> {
    const data = await this.readAll();
    const next = data.profiles.filter((p) => p.name !== name);
    const removed = next.length !== data.profiles.length;
    if (!removed) return false;
    data.profiles = next;
    if (data.defaultProfile === name) {
      data.defaultProfile = next[0]?.name;
    }
    await this.writeAll(stripLoadError(data));
    return true;
  }

  async setDefault(name: string): Promise<boolean> {
    const data = await this.readAll();
    if (!data.profiles.some((p) => p.name === name)) return false;
    data.defaultProfile = name;
    await this.writeAll(stripLoadError(data));
    return true;
  }
}

function stripLoadError(data: ProfilesFileWithLoadError): ProfilesFile {
  return { version: 1, defaultProfile: data.defaultProfile, profiles: data.profiles };
}
