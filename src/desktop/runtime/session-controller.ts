import { LogStore } from '../../core/log-store.js';
import { DEFAULT_EVENT_FILTERS } from '../../core/defaults.js';
import { executeCommand } from '../../core/command-router.js';
import type { EventFilter, LogEntry, LogTag, OutputFormat } from '../../core/types.js';
import { nowIso, safeJson, formatOutput, shouldPrint } from '../../core/utils.js';
import { createLaresClient, type ClientEnv, type CreateLaresClientOptions } from '../../infra/lares-client.js';
import type { SocketEventEmitted } from '../../infra/socket-types.js';
import { CommandHistory } from '../../core/history.js';
import { DesktopProfilesRepository } from './profiles-repository-desktop.js';
import { readUtf8File, resolveDefaultSessionPath, writeUtf8File } from './tauri-fs.js';
import type { ReplayEvent } from '../../core/replay-engine.js';
import { ReplayEngine } from '../../core/replay-engine.js';
import type { Macro, MacroStep } from '@pro/macros/types.js';
import { MacroEngine } from '@pro/macros/engine.js';
import { isFeatureLicensed } from './commercial-license-prefs.js';

type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'error';

export interface ConnectInput {
  ip: string;
  pin: string;
  sender: string;
  wss: boolean;
  profileName?: string;
}

export interface ActiveMacroSnapshot {
  name: string;
  position: number;
  total: number;
  status: 'stopped' | 'playing' | 'paused';
}

export interface SessionSnapshot {
  connected: boolean;
  connectionStatus: ConnectionStatus;
  replayStatus: string;
  outputFormat: OutputFormat;
  eventFilters: EventFilter[];
  logEntries: LogEntry[];
  commandLine: string;
  error?: string;
  logTagFilters: LogTag[] | undefined;
  activeProfileName: string | undefined;
  macros: Macro[];
  activeMacro?: ActiveMacroSnapshot;
  recordingMacro: boolean;
  recordingMacroSteps: number;
}

export type CreateLaresClientFn = (
  env: ClientEnv,
  options?: CreateLaresClientOptions,
) => Promise<Awaited<ReturnType<typeof createLaresClient>>>;

export interface SessionControllerDeps {
  createClient?: CreateLaresClientFn;
  profiles?: DesktopProfilesRepository;
  isMacrosLicensed?: () => boolean;
}

function generateId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `m-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseReplayContent(raw: string): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const parsed = JSON.parse(line) as Partial<ReplayEvent>;
    if (typeof parsed.atMs !== 'number' || !parsed.entry) continue;
    const entry = parsed.entry as Partial<LogEntry>;
    if (!entry.ts || !entry.tag || !entry.level || !entry.message) continue;
    events.push({
      atMs: Math.max(0, Math.floor(parsed.atMs)),
      entry: {
        ts: entry.ts,
        tag: entry.tag as LogEntry['tag'],
        level: entry.level as LogEntry['level'],
        message: entry.message,
        groupId: typeof entry.groupId === 'string' ? entry.groupId : undefined,
      },
    });
  }
  return events.sort((a, b) => a.atMs - b.atMs);
}

export class SessionController {
  private readonly store = new LogStore();
  private readonly history = new CommandHistory();
  private readonly deps: SessionControllerDeps;
  private readonly profiles: DesktopProfilesRepository;
  private readonly listeners = new Set<() => void>();
  private outputFormat: OutputFormat = 'pretty';
  private eventFilters = new Set<EventFilter>(DEFAULT_EVENT_FILTERS);
  private connectionStatus: ConnectionStatus = 'idle';
  private replayStatus = 'off';
  private commandLine = '';
  private connected = false;
  private error: string | undefined;
  private lares: Awaited<ReturnType<typeof createLaresClient>>['lares'] | undefined;
  private socket: Awaited<ReturnType<typeof createLaresClient>>['socket'] | undefined;
  private unsubscribeSocket: (() => void) | undefined;
  private logTagFilters: LogTag[] | undefined;
  private activeProfileName: string | undefined;
  private recordFilePath: string | undefined;
  private recordingStartedAtMs = 0;
  private pendingReplayRecord: ReplayEvent[] = [];
  private readonly replayEngine: ReplayEngine;
  private macros: Macro[] = [];
  private readonly macroEngine: MacroEngine;
  private macroRecordingBuffer: MacroStep[] | undefined;
  private macroRecordingPrevAtMs = 0;
  private submittingFromMacro = false;
  private readonly isMacrosLicensed: () => boolean;

  constructor(deps: SessionControllerDeps = {}) {
    this.deps = deps;
    this.profiles = deps.profiles ?? new DesktopProfilesRepository();
    this.isMacrosLicensed = deps.isMacrosLicensed ?? (() => isFeatureLicensed('macros'));
    this.replayEngine = new ReplayEngine(
      (entry) => {
        this.store.push(entry);
        this.emit();
      },
      () => {
        this.replayStatus = 'done';
        this.emit();
      },
    );
    this.macroEngine = new MacroEngine(
      async (line) => {
        this.submittingFromMacro = true;
        try { await this.submit(line); } finally { this.submittingFromMacro = false; }
      },
      () => this.emit(),
      (err, stepIndex) => {
        this.store.push({
          level: 'error', tag: 'ERROR',
          message: `Macro step ${String(stepIndex + 1)} failed: ${err.message}`,
        });
        this.emit();
      },
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  snapshot(): SessionSnapshot {
    const activeMacro = this.macroEngine.name !== undefined ? {
      name: this.macroEngine.name,
      position: this.macroEngine.position,
      total: this.macroEngine.total,
      status: this.macroEngine.status,
    } : undefined;
    return {
      connected: this.connected,
      connectionStatus: this.connectionStatus,
      replayStatus: this.replayStatus,
      outputFormat: this.outputFormat,
      eventFilters: Array.from(this.eventFilters),
      logEntries: this.store.all(),
      commandLine: this.commandLine,
      error: this.error,
      logTagFilters: this.logTagFilters,
      activeProfileName: this.activeProfileName,
      macros: this.macros,
      activeMacro,
      recordingMacro: this.macroRecordingBuffer !== undefined,
      recordingMacroSteps: this.macroRecordingBuffer?.length ?? 0,
    };
  }

  async connect(input: ConnectInput): Promise<void> {
    this.connectionStatus = 'connecting';
    this.error = undefined;
    if (input.profileName) {
      const profile = await this.profiles.get(input.profileName);
      this.logTagFilters = profile?.logTagFilters;
      this.macros = profile?.macros ?? [];
    } else {
      this.logTagFilters = undefined;
      this.macros = [];
    }
    this.emit();
    try {
      const factory = this.deps.createClient ?? createLaresClient;
      const client = await factory(input, { onSocketSend: (raw) => this.recordSent(raw) });
      this.lares = client.lares;
      this.socket = client.socket;
      this.unsubscribeSocket = client.socket.messages.subscribe((event) => this.onSocketMessage(event));
      this.connected = true;
      this.connectionStatus = 'online';
      this.activeProfileName = input.profileName;
      if (input.profileName) await this.profiles.setDefault(input.profileName);
      this.pushSystemMessage(`Connected to ${input.ip}`);
    } catch (error) {
      this.connected = false;
      this.connectionStatus = 'error';
      this.error = error instanceof Error ? error.message : String(error);
      this.pushSystemMessage(`Connection failed: ${this.error}`);
    }
    this.emit();
  }

  disconnect(): void {
    this.macroEngine.stop();
    this.macroRecordingBuffer = undefined;
    this.macros = [];
    this.unsubscribeSocket?.();
    this.unsubscribeSocket = undefined;
    this.lares?.close();
    this.lares = undefined;
    this.socket = undefined;
    this.connected = false;
    this.connectionStatus = 'idle';
    this.error = undefined;
    this.activeProfileName = undefined;
    this.emit();
  }

  setCommandLine(line: string): void {
    this.commandLine = line;
    this.emit();
  }

  setOutputFormat(fmt: OutputFormat): void {
    this.outputFormat = fmt;
    this.emit();
  }

  clearLogs(): void {
    this.store.clear();
    this.emit();
  }

  setLogTagFilters(filters: LogTag[] | undefined): void {
    this.logTagFilters = filters;
    this.emit();
    if (this.activeProfileName) {
      const name = this.activeProfileName;
      void this.profiles.setLogTagFilters(name, filters);
    }
  }

  listMacros(): Macro[] {
    return this.macros;
  }

  private requireMacrosLicense(): void {
    if (!this.isMacrosLicensed()) {
      throw new Error('Macros require a commercial license.');
    }
  }

  async saveMacro(input: { id?: string; name: string; description?: string; steps: MacroStep[] }): Promise<Macro> {
    this.requireMacrosLicense();
    const ts = nowIso();
    const existingIdx = input.id ? this.macros.findIndex((m) => m.id === input.id) : -1;
    const existing = existingIdx >= 0 ? this.macros[existingIdx] : undefined;
    const macro: Macro = {
      id: existing?.id ?? input.id ?? generateId(),
      name: input.name,
      description: input.description,
      steps: input.steps,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    const next = existingIdx >= 0 ? [...this.macros] : [...this.macros, macro];
    if (existingIdx >= 0) next[existingIdx] = macro;
    this.macros = next;
    this.emit();
    if (this.activeProfileName) await this.profiles.setMacros(this.activeProfileName, next);
    return macro;
  }

  async removeMacro(id: string): Promise<void> {
    this.requireMacrosLicense();
    const next = this.macros.filter((m) => m.id !== id);
    if (next.length === this.macros.length) return;
    this.macros = next;
    this.emit();
    if (this.activeProfileName) await this.profiles.setMacros(this.activeProfileName, next);
  }

  runMacro(id: string): void {
    this.requireMacrosLicense();
    const macro = this.macros.find((m) => m.id === id);
    if (!macro) return;
    this.macroEngine.load(macro);
    this.macroEngine.play();
  }

  pauseMacro(): void { this.requireMacrosLicense(); this.macroEngine.pause(); }
  resumeMacro(): void { this.requireMacrosLicense(); this.macroEngine.play(); }
  stopMacro(): void { this.requireMacrosLicense(); this.macroEngine.stop(); }
  stepMacro(): void { this.requireMacrosLicense(); this.macroEngine.step(); }

  startRecordingMacro(): void {
    this.requireMacrosLicense();
    this.macroRecordingBuffer = [];
    this.macroRecordingPrevAtMs = Date.now();
    this.emit();
  }

  async stopRecordingMacro(name: string, description?: string): Promise<Macro | undefined> {
    this.requireMacrosLicense();
    const steps = this.macroRecordingBuffer;
    this.macroRecordingBuffer = undefined;
    this.emit();
    if (!steps || steps.length === 0) return undefined;
    return await this.saveMacro({ name, description, steps });
  }

  cancelRecordingMacro(): void {
    this.macroRecordingBuffer = undefined;
    this.emit();
  }

  private maybeRecordMacroStep(line: string): void {
    if (!this.isMacrosLicensed()) return;
    if (this.submittingFromMacro) return;
    if (!this.macroRecordingBuffer) return;
    const trimmed = line.trim();
    if (!trimmed) return;
    const head = trimmed.split(/\s+/)[0] ?? '';
    if (head === 'macro' || head === 'record' || head === 'replay') return;
    const now = Date.now();
    const delta = this.macroRecordingBuffer.length === 0
      ? 0
      : Math.max(0, now - this.macroRecordingPrevAtMs);
    this.macroRecordingPrevAtMs = now;
    this.macroRecordingBuffer.push(delta > 0 ? { command: trimmed, delayMs: delta } : { command: trimmed });
  }

  historyUp(prefix: string): string | undefined {
    return this.history.previous(prefix);
  }

  historyDown(prefix: string): string | undefined {
    return this.history.next(prefix);
  }

  async submit(line: string): Promise<void> {
    if (!this.lares || !this.socket) return;
    this.maybeRecordMacroStep(line);
    this.history.add(line);
    this.commandLine = '';
    const groupId = `cmd-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const items = await executeCommand(line, {
        lares: this.lares,
        socketSend: this.socket.send,
        outputFormat: this.outputFormat,
        eventFilters: this.eventFilters,
        onEventFiltersChanged: (next) => { this.eventFilters = next; },
        onFormatChanged: (fmt) => { this.outputFormat = fmt; },
        rawFullEnabled: false,
        onRawFullChanged: () => {},
        onExport: async (path) => await this.exportSession(path),
        getStateSnapshot: (scope) => this.stateScopeSnapshot(scope),
        onRecordCommand: async (args) => await this.handleRecordCommand(args),
        onReplayCommand: async (args) => await this.handleReplayCommand(args),
      });
      for (const item of items) {
        if (item === '__EXIT__') {
          this.disconnect();
          continue;
        }
        if (typeof item === 'string') {
          this.pushCommandMessage(item, groupId);
        } else {
          this.pushCommandMessage(item.text, groupId, item.payload);
        }
      }
    } catch (error) {
      this.store.push({
        level: 'error',
        tag: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    this.emit();
  }

  async listProfiles() {
    return await this.profiles.readAll();
  }

  async saveProfile(input: { name: string; ip: string; pin: string; wss: boolean; sender: string; makeDefault?: boolean }): Promise<void> {
    await this.profiles.upsert(input);
  }

  async removeProfile(name: string): Promise<void> {
    await this.profiles.remove(name);
  }

  async setDefaultProfileName(name: string): Promise<void> {
    await this.profiles.setDefault(name);
  }

  private async exportSession(path?: string): Promise<string> {
    const destination = path ?? await resolveDefaultSessionPath('session', '.log');
    const lines = this.store.all().map((log) => `[${log.ts}] [${log.tag}] [${log.level}] ${log.message}`);
    await writeUtf8File(destination, `${lines.join('\n')}\n`);
    return destination;
  }

  private async handleRecordCommand(args: string[]): Promise<string[]> {
    const [sub, maybePath] = args;
    if (sub === 'start') {
      this.recordFilePath = maybePath ?? await resolveDefaultSessionPath('replay', '.ndjson');
      this.recordingStartedAtMs = Date.now();
      this.pendingReplayRecord = [];
      return [`Recording started: ${this.recordFilePath}`];
    }
    if (sub === 'stop') {
      if (!this.recordFilePath) throw new Error('Recording is not active.');
      const content = this.pendingReplayRecord.map((event) => JSON.stringify(event)).join('\n');
      await writeUtf8File(this.recordFilePath, `${content}\n`);
      const out = this.recordFilePath;
      this.recordFilePath = undefined;
      this.pendingReplayRecord = [];
      return [`Recording saved: ${out}`];
    }
    throw new Error('Usage: record start [path] | record stop');
  }

  private async handleReplayCommand(args: string[]): Promise<string[]> {
    const [sub, value] = args;
    if (sub === 'load') {
      if (!value) throw new Error('Usage: replay load <path>');
      const raw = await readUtf8File(value);
      const events = parseReplayContent(raw);
      this.replayEngine.load(events);
      this.replayStatus = `loaded:${String(events.length)}`;
      return [`Replay loaded: ${String(events.length)} events`];
    }
    if (sub === 'play') {
      this.replayEngine.play();
      this.replayStatus = `playing@${String(this.replayEngine.playbackSpeed)}x`;
      return ['Replay started'];
    }
    if (sub === 'pause') {
      this.replayEngine.pause();
      this.replayStatus = 'paused';
      return ['Replay paused'];
    }
    if (sub === 'step') {
      this.replayEngine.step();
      this.replayStatus = `paused:${String(this.replayEngine.position)}/${String(this.replayEngine.loadedEvents)}`;
      return ['Replay stepped'];
    }
    if (sub === 'speed') {
      const speed = Number(value);
      if (!value || !Number.isFinite(speed) || speed <= 0) throw new Error('Usage: replay speed <n>');
      this.replayEngine.setSpeed(speed);
      this.replayStatus = `${this.replayEngine.status}@${String(this.replayEngine.playbackSpeed)}x`;
      return [`Replay speed set to: ${String(speed)}x`];
    }
    if (sub === 'stop') {
      this.replayEngine.stop();
      this.replayStatus = 'off';
      return ['Replay stopped'];
    }
    throw new Error('Usage: replay load <path> | replay play|pause|step|speed <n>|stop');
  }

  private stateScopeSnapshot(scope: string): unknown {
    if (!this.lares) return undefined;
    switch (scope) {
      case 'all':
        return {
          lights: this.lares.lights,
          covers: this.lares.covers,
          switches: this.lares.switches,
          gates: this.lares.gates,
          thermostats: this.lares.thermostats,
          zones: this.lares.zones,
          scenarios: this.lares.scenarios,
          system: this.lares.systemStatus,
          outputs: this.lares.outputs,
        };
      case 'lights': return this.lares.lights;
      case 'covers': return this.lares.covers;
      case 'switches': return this.lares.switches;
      case 'gates': return this.lares.gates;
      case 'thermostats': return this.lares.thermostats;
      case 'zones': return this.lares.zones;
      case 'scenarios': return this.lares.scenarios;
      case 'system': return this.lares.systemStatus;
      case 'outputs': return this.lares.outputs;
      default: return undefined;
    }
  }

  private onSocketMessage(event: SocketEventEmitted): void {
    if (event.type === 'open') {
      this.connectionStatus = 'online';
      this.emit();
      return;
    }
    if (event.type === 'close') {
      this.connectionStatus = 'connecting';
      this.emit();
      return;
    }
    this.maybeRecordEvent(event);
    if (event.type === 'error' && shouldPrint(this.eventFilters, 'errors')) {
      const isObj = typeof event.message !== 'string' && event.message !== undefined;
      this.store.push({
        level: 'error',
        tag: 'ERROR',
        message: typeof event.message === 'string' ? event.message : safeJson(event.message),
        payload: isObj ? event.message : undefined,
      });
    } else if (event.type === 'raw' && shouldPrint(this.eventFilters, 'raw')) {
      const { text, payload } = this.coerceEventMessage(event.message);
      this.store.push({ level: 'debug', tag: 'RAW_RX', message: text, payload });
    } else if (event.type === 'response' && shouldPrint(this.eventFilters, 'acks')) {
      const { text, payload } = this.coerceEventMessage(event.message);
      this.store.push({ level: 'info', tag: 'ACK', message: text, payload });
    } else if (event.type === 'change' && shouldPrint(this.eventFilters, 'changes')) {
      const { text, payload } = this.coerceEventMessage(event.message);
      this.store.push({ level: 'info', tag: 'CHANGE', message: text, payload });
    } else if (event.type === 'multi_types' && shouldPrint(this.eventFilters, 'multitypes')) {
      const { text, payload } = this.coerceEventMessage(event.message);
      this.store.push({ level: 'info', tag: 'BULK', message: text, payload });
    }
    this.emit();
  }

  private recordSent(raw: string): void {
    if (!shouldPrint(this.eventFilters, 'sent')) return;
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { /* keep raw text path */ }
    const cmdObj = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
    const cmdName = typeof cmdObj?.CMD === 'string' ? cmdObj.CMD : 'CMD';
    const cmdId = cmdObj?.ID !== undefined ? String(cmdObj.ID) : `t${String(Date.now())}`;
    const groupId = `rawtx-${cmdId}`;
    const text = payload !== undefined ? formatOutput(payload, this.outputFormat) : raw;
    this.store.push({ level: 'info', tag: 'RAW_TX', groupId, message: `→ ${cmdName}` });
    this.store.push({ level: 'info', tag: 'RAW_TX', groupId, message: text, payload });
    this.emit();
  }

  private coerceEventMessage(raw: string | Record<string, unknown> | undefined): { text: string; payload?: unknown } {
    if (raw === undefined) return { text: '' };
    if (typeof raw !== 'string') return { text: formatOutput(raw, this.outputFormat), payload: raw };
    try {
      const parsed = JSON.parse(raw) as unknown;
      return { text: formatOutput(parsed, this.outputFormat), payload: parsed };
    } catch {
      return { text: raw };
    }
  }

  private maybeRecordEvent(event: SocketEventEmitted): void {
    if (!this.recordFilePath) return;
    if (event.type === 'open' || event.type === 'close') return;
    const tag = event.type === 'error'
      ? 'ERROR'
      : event.type === 'response'
        ? 'ACK'
        : event.type === 'change'
          ? 'CHANGE'
          : event.type === 'multi_types'
            ? 'BULK'
            : 'RAW_RX';
    const level = event.type === 'error' ? 'error' : event.type === 'raw' ? 'debug' : 'info';
    this.pendingReplayRecord.push({
      atMs: Math.max(0, Date.now() - this.recordingStartedAtMs),
      entry: {
        ts: nowIso(),
        level,
        tag,
        message: typeof event.message === 'string' ? event.message : safeJson(event.message),
      },
    });
  }

  private pushCommandMessage(text: string, groupId?: string, payload?: unknown): void {
    this.store.push({
      level: 'info',
      tag: 'LOG',
      message: text.length > 0 ? text : ' ',
      groupId,
      payload,
    });
  }

  private pushSystemMessage(text: string): void {
    this.store.push({ level: 'info', tag: 'SYSTEM', message: text });
  }
}
