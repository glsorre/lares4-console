import { readProfilesFile, writeProfilesFile } from './tauri-fs.js';

export interface ProfilesPersistence {
  read: () => Promise<string | null>;
  write: (content: string) => Promise<void>;
}

const defaultPersistence: ProfilesPersistence = {
  read: readProfilesFile,
  write: writeProfilesFile,
};

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

const DEFAULT_FILE: ProfilesFile = { version: 1, profiles: [] };

function nowIso(): string {
  return new Date().toISOString();
}

export class DesktopProfilesRepository {
  constructor(private readonly persistence: ProfilesPersistence = defaultPersistence) {}

  async readAll(): Promise<ProfilesFile> {
    const raw = await this.persistence.read();
    if (!raw) return { ...DEFAULT_FILE };
    try {
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
    await this.persistence.write(`${JSON.stringify(data, null, 2)}\n`);
  }

  async get(name: string): Promise<ConnectionProfile | undefined> {
    const data = await this.readAll();
    return data.profiles.find((p) => p.name === name);
  }

  async upsert(input: { name: string; ip: string; pin: string; wss: boolean; sender: string; makeDefault?: boolean }): Promise<void> {
    const data = await this.readAll();
    const ts = nowIso();
    const idx = data.profiles.findIndex((p) => p.name === input.name);
    const prev = idx >= 0 ? data.profiles[idx] : undefined;
    const profile: ConnectionProfile = {
      name: input.name,
      ip: input.ip,
      pin: input.pin,
      wss: input.wss,
      sender: input.sender,
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
    };
    if (idx >= 0) data.profiles[idx] = profile;
    else data.profiles.push(profile);
    if (input.makeDefault || !data.defaultProfile) data.defaultProfile = input.name;
    await this.writeAll(data);
  }

  async remove(name: string): Promise<void> {
    const data = await this.readAll();
    data.profiles = data.profiles.filter((p) => p.name !== name);
    if (data.defaultProfile === name) data.defaultProfile = data.profiles[0]?.name;
    await this.writeAll(data);
  }

  async setDefault(name: string): Promise<void> {
    const data = await this.readAll();
    if (!data.profiles.some((p) => p.name === name)) return;
    data.defaultProfile = name;
    await this.writeAll(data);
  }
}
