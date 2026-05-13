import { readProfilesFile, writeProfilesFile } from './tauri-fs.js';
import type { LogTag } from '../../core/types.js';
import type { Macro, MacroStep } from '@pro/macros/types.js';

export interface ProfilesPersistence {
  read: () => Promise<string | null>;
  write: (content: string) => Promise<void>;
}

const defaultPersistence: ProfilesPersistence = {
  read: readProfilesFile,
  write: writeProfilesFile,
};

const VALID_TAGS: ReadonlySet<LogTag> = new Set([
  'ACK', 'RAW_RX', 'RAW_TX', 'BULK', 'CHANGE', 'ERROR', 'LOG', 'SYSTEM',
]);

function sanitizeMacros(raw: unknown): Macro[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Macro[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    if (typeof m.id !== 'string' || typeof m.name !== 'string') continue;
    if (typeof m.createdAt !== 'string' || typeof m.updatedAt !== 'string') continue;
    if (!Array.isArray(m.steps)) continue;
    const steps: MacroStep[] = [];
    for (const s of m.steps) {
      if (!s || typeof s !== 'object') continue;
      const step = s as Record<string, unknown>;
      if (typeof step.command !== 'string') continue;
      const delay = typeof step.delayMs === 'number' && Number.isFinite(step.delayMs)
        ? Math.max(0, Math.floor(step.delayMs))
        : undefined;
      steps.push(delay !== undefined ? { command: step.command, delayMs: delay } : { command: step.command });
    }
    out.push({
      id: m.id,
      name: m.name,
      description: typeof m.description === 'string' ? m.description : undefined,
      steps,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    });
  }
  return out;
}

export interface ConnectionProfile {
  name: string;
  ip: string;
  pin: string;
  wss: boolean;
  sender: string;
  createdAt: string;
  updatedAt: string;
  logTagFilters?: LogTag[];
  macros?: Macro[];
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
      const profiles = Array.isArray(parsed.profiles) ? parsed.profiles
        .filter((p): p is ConnectionProfile => {
          return typeof p?.name === 'string'
            && typeof p?.ip === 'string'
            && typeof p?.pin === 'string'
            && typeof p?.wss === 'boolean'
            && typeof p?.sender === 'string'
            && typeof p?.createdAt === 'string'
            && typeof p?.updatedAt === 'string';
        })
        .map((p) => {
          const tags = Array.isArray((p as { logTagFilters?: unknown }).logTagFilters)
            ? ((p as { logTagFilters: unknown[] }).logTagFilters)
              .filter((t): t is LogTag => typeof t === 'string' && VALID_TAGS.has(t as LogTag))
            : undefined;
          const macros = sanitizeMacros((p as { macros?: unknown }).macros);
          return {
            ...p,
            logTagFilters: tags,
            macros,
          };
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

  async upsert(input: {
    name: string;
    ip: string;
    pin: string;
    wss: boolean;
    sender: string;
    makeDefault?: boolean;
    logTagFilters?: LogTag[];
    macros?: Macro[];
  }): Promise<void> {
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
      logTagFilters: input.logTagFilters !== undefined ? input.logTagFilters : prev?.logTagFilters,
      macros: input.macros !== undefined ? input.macros : prev?.macros,
    };
    if (idx >= 0) data.profiles[idx] = profile;
    else data.profiles.push(profile);
    if (input.makeDefault || !data.defaultProfile) data.defaultProfile = input.name;
    await this.writeAll(data);
  }

  async setLogTagFilters(name: string, filters: LogTag[] | undefined): Promise<void> {
    const data = await this.readAll();
    const idx = data.profiles.findIndex((p) => p.name === name);
    if (idx < 0) return;
    const prev = data.profiles[idx];
    data.profiles[idx] = { ...prev, logTagFilters: filters, updatedAt: nowIso() };
    await this.writeAll(data);
  }

  async setMacros(name: string, macros: Macro[]): Promise<void> {
    const data = await this.readAll();
    const idx = data.profiles.findIndex((p) => p.name === name);
    if (idx < 0) return;
    const prev = data.profiles[idx];
    data.profiles[idx] = { ...prev, macros, updatedAt: nowIso() };
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
