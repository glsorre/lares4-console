import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface ConnectionProfile {
  name: string;
  ip: string;
  pin: string;
  wss: boolean;
  sender: string;
  createdAt: string;
  updatedAt: string;
}

interface ProfilesFile {
  version: 1;
  defaultProfile?: string;
  profiles: ConnectionProfile[];
}

const DEFAULT_FILE: ProfilesFile = {
  version: 1,
  profiles: [],
};

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

  async readAll(): Promise<ProfilesFile> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ProfilesFile>;
      const profiles = Array.isArray(parsed.profiles) ? parsed.profiles.filter((p): p is ConnectionProfile => {
        return typeof p?.name === 'string'
          && typeof p?.ip === 'string'
          && typeof p?.pin === 'string'
          && typeof p?.wss === 'boolean'
          && typeof p?.sender === 'string'
          && typeof p?.createdAt === 'string'
          && typeof p?.updatedAt === 'string';
      }) : [];
      return {
        version: 1,
        defaultProfile: typeof parsed.defaultProfile === 'string' ? parsed.defaultProfile : undefined,
        profiles,
      };
    } catch {
      return { ...DEFAULT_FILE };
    }
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
    const profile: ConnectionProfile = {
      name: input.name,
      ip: input.ip,
      pin: input.pin,
      wss: input.wss,
      sender: input.sender,
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
    };
    if (index >= 0) data.profiles[index] = profile;
    else data.profiles.push(profile);
    if (input.makeDefault || !data.defaultProfile) {
      data.defaultProfile = profile.name;
    }
    await this.writeAll(data);
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
    await this.writeAll(data);
    return true;
  }

  async setDefault(name: string): Promise<boolean> {
    const data = await this.readAll();
    if (!data.profiles.some((p) => p.name === name)) return false;
    data.defaultProfile = name;
    await this.writeAll(data);
    return true;
  }
}
