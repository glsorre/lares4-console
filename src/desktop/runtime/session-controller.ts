import { LogStore } from '../../core/log-store.js';
import { DEFAULT_EVENT_FILTERS } from '../../core/defaults.js';
import { executeCommand } from '../../core/command-router.js';
import type { EventFilter, LogEntry, OutputFormat } from '../../core/types.js';
import { nowIso, safeJson, formatOutput, shouldPrint } from '../../core/utils.js';
import { createLaresClient, type ClientEnv } from '../../infra/lares-client.js';
import type { SocketEventEmitted } from '../../infra/socket-types.js';
import { CommandHistory } from '../../core/history.js';
import { DesktopProfilesRepository } from './profiles-repository-desktop.js';
import { readUtf8File, resolveDefaultSessionPath, writeUtf8File } from './tauri-fs.js';
import type { ReplayEvent } from '../../core/replay-engine.js';
import { ReplayEngine } from '../../core/replay-engine.js';

type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'error';

export interface ConnectInput {
  ip: string;
  pin: string;
  sender: string;
  wss: boolean;
  profileName?: string;
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
}

export type CreateLaresClientFn = (env: ClientEnv) => Promise<Awaited<ReturnType<typeof createLaresClient>>>;

export interface SessionControllerDeps {
  createClient?: CreateLaresClientFn;
  profiles?: DesktopProfilesRepository;
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
  private recordFilePath: string | undefined;
  private recordingStartedAtMs = 0;
  private pendingReplayRecord: ReplayEvent[] = [];
  private readonly replayEngine: ReplayEngine;

  constructor(deps: SessionControllerDeps = {}) {
    this.deps = deps;
    this.profiles = deps.profiles ?? new DesktopProfilesRepository();
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
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  snapshot(): SessionSnapshot {
    return {
      connected: this.connected,
      connectionStatus: this.connectionStatus,
      replayStatus: this.replayStatus,
      outputFormat: this.outputFormat,
      eventFilters: Array.from(this.eventFilters),
      logEntries: this.store.all(),
      commandLine: this.commandLine,
      error: this.error,
    };
  }

  async connect(input: ConnectInput): Promise<void> {
    this.connectionStatus = 'connecting';
    this.error = undefined;
    this.emit();
    try {
      const factory = this.deps.createClient ?? createLaresClient;
      const client = await factory(input);
      this.lares = client.lares;
      this.socket = client.socket;
      this.unsubscribeSocket = client.socket.messages.subscribe((event) => this.onSocketMessage(event));
      this.connected = true;
      this.connectionStatus = 'online';
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
    this.unsubscribeSocket?.();
    this.unsubscribeSocket = undefined;
    this.lares?.close();
    this.lares = undefined;
    this.socket = undefined;
    this.connected = false;
    this.connectionStatus = 'idle';
    this.emit();
  }

  setCommandLine(line: string): void {
    this.commandLine = line;
    this.emit();
  }

  historyUp(prefix: string): string | undefined {
    return this.history.previous(prefix);
  }

  historyDown(prefix: string): string | undefined {
    return this.history.next(prefix);
  }

  async submit(line: string): Promise<void> {
    if (!this.lares || !this.socket) return;
    this.history.add(line);
    this.commandLine = '';
    try {
      const lines = await executeCommand(line, {
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
      for (const text of lines) {
        if (text === '__EXIT__') {
          this.disconnect();
          continue;
        }
        this.pushCommandMessage(text);
      }
    } catch (error) {
      this.store.push({ level: 'error', tag: 'ERROR', message: error instanceof Error ? error.message : String(error) });
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
      this.store.push({ level: 'error', tag: 'ERROR', message: typeof event.message === 'string' ? event.message : safeJson(event.message) });
    } else if (event.type === 'raw' && shouldPrint(this.eventFilters, 'raw')) {
      this.store.push({ level: 'debug', tag: 'RAW_RX', message: this.coerceEventMessageText(event.message) });
    } else if (event.type === 'response' && shouldPrint(this.eventFilters, 'acks')) {
      this.store.push({ level: 'info', tag: 'ACK', message: this.coerceEventMessageText(event.message) });
    } else if (event.type === 'change' && shouldPrint(this.eventFilters, 'changes')) {
      this.store.push({ level: 'info', tag: 'CHANGE', message: this.coerceEventMessageText(event.message) });
    } else if (event.type === 'multi_types' && shouldPrint(this.eventFilters, 'multitypes')) {
      this.store.push({ level: 'info', tag: 'MULTI_TYPES', message: this.coerceEventMessageText(event.message) });
    }
    this.emit();
  }

  private coerceEventMessageText(raw: string | Record<string, unknown> | undefined): string {
    if (raw === undefined) return '';
    if (typeof raw !== 'string') return formatOutput(raw, this.outputFormat);
    try {
      return formatOutput(JSON.parse(raw), this.outputFormat);
    } catch {
      return raw;
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
            ? 'MULTI_TYPES'
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

  private pushCommandMessage(text: string): void {
    const lines = text.split('\n');
    for (const line of lines) {
      this.store.push({ level: 'info', tag: 'CMD', message: line.length > 0 ? line : ' ' });
    }
  }

  private pushSystemMessage(text: string): void {
    this.store.push({ level: 'info', tag: 'SYSTEM', message: text });
  }
}
