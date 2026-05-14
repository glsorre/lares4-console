import { LogStore, type Bookmark } from '../../core/log-store.js';
import { buildTopology, type TopologySnapshot } from '../../core/topology.js';
import { adaptLares4Topology } from './topology-adapter.js';
import { evaluateTriggers } from '@pro/triggers/engine.js';
import type { TriggerRule } from '@pro/triggers/types.js';
import { DEFAULT_EVENT_FILTERS } from '../../core/defaults.js';
import { executeCommand } from '../../core/command-router.js';
import type { EventFilter, LogEntry, LogSource, LogTag, OutputFormat } from '../../core/types.js';
import { nowIso, safeJson, formatOutput, formatUnknownError, isPlaceholderErrorMessage, shouldPrint } from '../../core/utils.js';
import { createLaresClient, type ClientEnv, type CreateLaresClientOptions } from '../../infra/lares-client.js';
import type { SocketCloseInfo, SocketErrorInfo, SocketFrame } from '../../infra/lares4-logger.js';
import type { SocketEventEmitted } from '../../infra/socket-types.js';
import { CommandHistory } from '../../core/history.js';
import { DesktopProfilesRepository } from './profiles-repository-desktop.js';
import { readUtf8File, resolveDefaultSessionPath, writeUtf8File } from './tauri-fs.js';
import type { ReplayEvent } from '../../core/replay-engine.js';
import { ReplayEngine } from '../../core/replay-engine.js';
import type { Macro, MacroStep } from '@pro/macros/types.js';
import { MacroEngine } from '@pro/macros/engine.js';
import { isFeatureLicensed } from './commercial-license-prefs.js';
import { isReadOnlyMode, setReadOnlyMode, subscribeReadOnlyMode } from './read-only-prefs.js';
import { createReadOnlyGuard, ReadOnlyBlockedError } from './read-only-guard.js';

type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'error';

const PENDING_TX_TIMEOUT_MS = 30_000;

function extractAckResult(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const inner = (payload as Record<string, unknown>).PAYLOAD;
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return undefined;
  const obj = inner as Record<string, unknown>;
  const detail = obj.RESULT_DETAIL;
  if (typeof detail === 'string' && detail.length > 0) return detail;
  const result = obj.RESULT;
  if (typeof result === 'string' && result.length > 0) return result;
  return undefined;
}

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
  topology: TopologySnapshot;
  bookmarks: Bookmark[];
  triggers: TriggerRule[];
  pendingTxCount: number;
  liveStreamPaused: boolean;
  readOnly: boolean;
  licensed: {
    macros: boolean;
    tabs: boolean;
    triggers: boolean;
    annotations: boolean;
    multiwindow: boolean;
  };
}

export type CreateLaresClientFn = (
  env: ClientEnv,
  options?: CreateLaresClientOptions,
) => Promise<Awaited<ReturnType<typeof createLaresClient>>>;

export interface SessionControllerDeps {
  createClient?: CreateLaresClientFn;
  profiles?: DesktopProfilesRepository;
  isMacrosLicensed?: () => boolean;
  isTabsLicensed?: () => boolean;
  isTriggersLicensed?: () => boolean;
  isAnnotationsLicensed?: () => boolean;
  isMultiwindowLicensed?: () => boolean;
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
    const source: LogEntry['source'] = entry.source === 'command' || entry.source === 'wire' || entry.source === 'lifecycle'
      ? entry.source
      : undefined;
    events.push({
      atMs: Math.max(0, Math.floor(parsed.atMs)),
      entry: {
        ts: entry.ts,
        tag: entry.tag as LogEntry['tag'],
        level: entry.level as LogEntry['level'],
        source,
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
  private readonly isTabsLicensed: () => boolean;
  private readonly isTriggersLicensed: () => boolean;
  private readonly isAnnotationsLicensed: () => boolean;
  private readonly isMultiwindowLicensed: () => boolean;
  private triggers: TriggerRule[] = [];
  private readonly pendingTx = new Map<string, {
    sentAtMs: number;
    txGroupId: string;
    cmd: string;
    payloadType?: string;
    source: LogSource;
  }>();
  /** Cache of recently-consumed correlations so the second observer (recordReceived vs onSocketMessage)
   *  can still attribute its source after the first observer drained `pendingTx`. */
  private readonly resolvedCorrelations = new Map<string, { cmdId: string; latencyMs: number; source: LogSource }>();
  /** Reentrant counter: when > 0 the active call stack is running a user-issued command, so
   *  wire frames emitted during it attribute to `'command'`. */
  private commandSourceDepth = 0;
  private liveStreamPaused = false;
  private readOnly = false;
  private unsubscribeReadOnly: (() => void) | undefined;
  private lastSocketClose: SocketCloseInfo | undefined;
  private lastSocketError: SocketErrorInfo | undefined;

  constructor(deps: SessionControllerDeps = {}) {
    this.deps = deps;
    this.profiles = deps.profiles ?? new DesktopProfilesRepository();
    this.isMacrosLicensed = deps.isMacrosLicensed ?? (() => isFeatureLicensed('macros'));
    this.isTabsLicensed = deps.isTabsLicensed ?? (() => isFeatureLicensed('tabs'));
    this.isTriggersLicensed = deps.isTriggersLicensed ?? (() => isFeatureLicensed('triggers'));
    this.isAnnotationsLicensed = deps.isAnnotationsLicensed ?? (() => isFeatureLicensed('annotations'));
    this.isMultiwindowLicensed = deps.isMultiwindowLicensed ?? (() => isFeatureLicensed('multiwindow'));
    this.replayEngine = new ReplayEngine(
      (entry) => {
        this.store.push({ ...entry, source: entry.source ?? 'lifecycle' });
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
          level: 'error', tag: 'ERROR', source: 'command',
          message: `Macro step ${String(stepIndex + 1)} failed: ${err.message}`,
        });
        this.emit();
      },
    );
    this.readOnly = isReadOnlyMode();
    this.unsubscribeReadOnly = subscribeReadOnlyMode((value) => {
      this.readOnly = value;
      if (value && this.macroEngine.status === 'playing') this.macroEngine.pause();
      this.emit();
    });
  }

  dispose(): void {
    this.unsubscribeReadOnly?.();
    this.unsubscribeReadOnly = undefined;
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
      topology: this.computeTopology(),
      bookmarks: this.store.listBookmarks(),
      triggers: this.triggers,
      pendingTxCount: this.pendingTx.size,
      liveStreamPaused: this.liveStreamPaused,
      readOnly: this.readOnly,
      licensed: {
        macros: this.isMacrosLicensed(),
        tabs: this.isTabsLicensed(),
        triggers: this.isTriggersLicensed(),
        annotations: this.isAnnotationsLicensed(),
        multiwindow: this.isMultiwindowLicensed(),
      },
    };
  }

  private computeTopology(): TopologySnapshot {
    if (!this.lares) return { groups: [], total: 0 };
    return buildTopology(adaptLares4Topology(this.lares));
  }

  private requireTriggersLicense(): void {
    if (!this.isTriggersLicensed()) {
      throw new Error('Triggers require a commercial license.');
    }
  }

  private requireAnnotationsLicense(): void {
    if (!this.isAnnotationsLicensed()) {
      throw new Error('Pin and bookmarks require a commercial license.');
    }
  }

  toggleBookmark(groupId: string, note?: string): void {
    this.requireAnnotationsLicense();
    this.store.toggleBookmark(groupId, note);
    this.emit();
  }

  setBookmarkNote(groupId: string, note: string | undefined): void {
    this.requireAnnotationsLicense();
    this.store.setBookmarkNote(groupId, note);
    this.emit();
  }

  isBookmarked(groupId: string): boolean {
    return this.store.isBookmarked(groupId);
  }

  async exportBookmarks(path?: string): Promise<string> {
    this.requireAnnotationsLicense();
    const destination = path ?? await resolveDefaultSessionPath('bookmarks', '.json');
    const entries = this.store.all();
    const bookmarks = this.store.listBookmarks();
    const enriched = bookmarks.map((bookmark) => {
      const group = entries.filter((e) => e.groupId === bookmark.groupId);
      return { ...bookmark, entries: group };
    });
    await writeUtf8File(destination, JSON.stringify(enriched, null, 2));
    return destination;
  }

  async connect(input: ConnectInput): Promise<void> {
    this.connectionStatus = 'connecting';
    this.error = undefined;
    this.lastSocketClose = undefined;
    this.lastSocketError = undefined;
    if (input.profileName) {
      const profile = await this.profiles.get(input.profileName);
      this.logTagFilters = profile?.logTagFilters;
      this.macros = profile?.macros ?? [];
      this.triggers = profile?.triggers ?? [];
      if (profile?.readOnly === true && !this.readOnly) setReadOnlyMode(true);
    } else {
      this.logTagFilters = undefined;
      this.macros = [];
      this.triggers = [];
    }
    this.emit();
    try {
      const factory = this.deps.createClient ?? createLaresClient;
      const client = await factory(input, {
        onSocketSend: (frame) => this.recordSent(frame),
        onSocketReceive: (frame) => this.recordReceived(frame),
        onSocketError: (info) => { this.lastSocketError = info; },
        onSocketClose: (info) => { this.lastSocketClose = info; },
      });
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
      this.error = this.resolveConnectError(error);
      this.pushSystemMessage(`Connection failed: ${this.error}`);
    }
    this.emit();
  }

  private resolveConnectError(error: unknown): string {
    const baseMsg = error instanceof Error ? error.message : '';
    if (baseMsg.length > 0 && !isPlaceholderErrorMessage(baseMsg)) return baseMsg;
    if (this.lastSocketClose && (this.lastSocketClose.code !== 1000 || !this.lastSocketClose.wasClean)) {
      return formatUnknownError(this.lastSocketClose);
    }
    if (this.lastSocketError) return formatUnknownError(this.lastSocketError);
    if (baseMsg) return baseMsg;
    return formatUnknownError(error);
  }

  disconnect(): void {
    this.macroEngine.stop();
    this.macroRecordingBuffer = undefined;
    this.macros = [];
    this.triggers = [];
    this.pendingTx.clear();
    this.liveStreamPaused = false;
    this.unsubscribeSocket?.();
    this.unsubscribeSocket = undefined;
    this.lares?.close();
    this.lares = undefined;
    this.socket = undefined;
    this.connected = false;
    this.connectionStatus = 'idle';
    this.error = undefined;
    this.activeProfileName = undefined;
    this.lastSocketClose = undefined;
    this.lastSocketError = undefined;
    this.emit();
  }

  listTriggers(): TriggerRule[] {
    return this.triggers;
  }

  async saveTriggers(triggers: TriggerRule[]): Promise<void> {
    this.requireTriggersLicense();
    this.triggers = triggers;
    this.emit();
    if (this.activeProfileName) await this.profiles.setTriggers(this.activeProfileName, triggers);
  }

  setLiveStreamPaused(paused: boolean): void {
    this.liveStreamPaused = paused;
    this.emit();
  }

  setReadOnly(value: boolean): void {
    setReadOnlyMode(value);
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
    if (this.readOnly) throw new Error('Read-only mode — macros cannot run.');
    const macro = this.macros.find((m) => m.id === id);
    if (!macro) return;
    this.macroEngine.load(macro);
    this.macroEngine.play();
  }

  pauseMacro(): void { this.requireMacrosLicense(); this.macroEngine.pause(); }
  resumeMacro(): void {
    this.requireMacrosLicense();
    if (this.readOnly) throw new Error('Read-only mode — macros cannot resume.');
    this.macroEngine.play();
  }
  stopMacro(): void { this.requireMacrosLicense(); this.macroEngine.stop(); }
  stepMacro(): void {
    this.requireMacrosLicense();
    if (this.readOnly) throw new Error('Read-only mode — macros cannot step.');
    this.macroEngine.step();
  }

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
    const baseLares = this.lares;
    const baseSend = this.socket.send;
    const ctxIo = this.readOnly
      ? createReadOnlyGuard(baseLares, baseSend)
      : { lares: baseLares, socketSend: baseSend };
    try {
      const items = await this.runWithCommandSource(() => executeCommand(line, {
        lares: ctxIo.lares,
        socketSend: ctxIo.socketSend,
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
      }));
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
      if (error instanceof ReadOnlyBlockedError) {
        this.store.push({
          level: 'warn',
          tag: 'SYSTEM',
          source: 'command',
          message: error.message,
          groupId,
        });
      } else {
        this.store.push({
          level: 'error',
          tag: 'ERROR',
          source: 'command',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.emit();
  }

  /** Run `fn` with the command-source flag raised so any wire frames emitted during the call attribute to `'command'`. */
  private async runWithCommandSource<T>(fn: () => Promise<T>): Promise<T> {
    this.commandSourceDepth += 1;
    try {
      return await fn();
    } finally {
      this.commandSourceDepth -= 1;
    }
  }

  async listProfiles() {
    return await this.profiles.readAll();
  }

  async saveProfile(input: {
    name: string;
    ip: string;
    pin: string;
    wss: boolean;
    sender: string;
    readOnly?: boolean;
    makeDefault?: boolean;
  }): Promise<void> {
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
    let pushed = false;
    if (event.type === 'error' && shouldPrint(this.eventFilters, 'errors')) {
      const isObj = typeof event.message !== 'string' && event.message !== undefined;
      const rawText = typeof event.message === 'string' ? event.message : formatUnknownError(event.message);
      let text = rawText;
      if (isPlaceholderErrorMessage(rawText)) {
        const fallback = this.lastSocketClose ?? this.lastSocketError;
        const substituted = fallback ? formatUnknownError(fallback) : rawText;
        text = isPlaceholderErrorMessage(substituted) ? 'WebSocket error' : substituted;
      }
      this.store.push({
        level: 'error',
        tag: 'ERROR',
        source: 'lifecycle',
        message: text,
        payload: isObj ? event.message : undefined,
      });
      pushed = true;
    } else if (event.type === 'raw') {
      // Handled by recordReceived (WS-layer monkey-patch). No-op here to avoid double push.
    } else if (event.type === 'response') {
      const { text, payload } = this.coerceEventMessage(event.message);
      const correlation = this.correlateAck(payload);
      if (correlation) {
        const ackResult = extractAckResult(payload);
        this.store.patchByGroupId(`rawtx-${correlation.cmdId}`, {
          correlationId: correlation.cmdId,
          latencyMs: correlation.latencyMs,
          ack: {
            result: ackResult,
            latencyMs: correlation.latencyMs,
            payload,
            ts: new Date().toISOString(),
          },
        });
      }
      // Suppress the standalone ACK row when paired with a TX (the suffix chip on the
      // RAW_TX row replaces it). Orphan ACKs still get their own row so they remain visible.
      if (!correlation && shouldPrint(this.eventFilters, 'acks')) {
        this.store.push({
          level: 'info',
          tag: 'ACK',
          source: 'lifecycle',
          message: text,
          payload,
        });
        pushed = true;
      }
    } else if (event.type === 'change' && shouldPrint(this.eventFilters, 'changes')) {
      const { text, payload } = this.coerceEventMessage(event.message);
      const isAckBody =
        payload !== null
        && typeof payload === 'object'
        && !Array.isArray(payload)
        && 'RESULT' in (payload as Record<string, unknown>);
      if (!isAckBody) {
        this.store.push({ level: 'info', tag: 'CHANGE', source: 'lifecycle', message: text, payload });
        pushed = true;
      }
    } else if (event.type === 'multi_types' && shouldPrint(this.eventFilters, 'multitypes')) {
      const { text, payload } = this.coerceEventMessage(event.message);
      this.store.push({ level: 'info', tag: 'BULK', source: 'lifecycle', message: text, payload });
      pushed = true;
    }
    if (pushed) this.runTriggersForLatest();
    this.emit();
  }

  private correlateAck(payload: unknown, nowTs: number = Date.now()): { cmdId: string; latencyMs: number; source: LogSource } | undefined {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
    const obj = payload as Record<string, unknown>;
    const inner = obj.PAYLOAD && typeof obj.PAYLOAD === 'object' && !Array.isArray(obj.PAYLOAD)
      ? obj.PAYLOAD as Record<string, unknown>
      : undefined;
    // 1. Direct ID match.
    const rawId = obj.ID ?? inner?.ID;
    if (rawId !== undefined && rawId !== null) {
      const cmdId = String(rawId);
      const pending = this.pendingTx.get(cmdId);
      if (pending) {
        this.pendingTx.delete(cmdId);
        const resolved = { cmdId, latencyMs: Math.max(0, nowTs - pending.sentAtMs), source: pending.source };
        this.rememberResolvedCorrelation(resolved);
        return resolved;
      }
      const cached = this.resolvedCorrelations.get(cmdId);
      if (cached) return cached;
    }
    // 2. CMD/PAYLOAD_TYPE-pair fallback (panel may not echo request ID).
    const replyCmd = typeof obj.CMD === 'string' ? obj.CMD : undefined;
    if (!replyCmd) return undefined;
    const strippedCmd = replyCmd.endsWith('_RES') ? replyCmd.slice(0, -4) : replyCmd;
    const replyPayloadType = typeof obj.PAYLOAD_TYPE === 'string' ? obj.PAYLOAD_TYPE : undefined;
    const strippedPayloadType = replyPayloadType?.endsWith('_ACK')
      ? replyPayloadType.slice(0, -4)
      : replyPayloadType;
    let oldest: { id: string; sentAtMs: number; source: LogSource } | undefined;
    for (const [id, pending] of this.pendingTx) {
      if (pending.cmd !== strippedCmd) continue;
      if (strippedPayloadType !== undefined
        && pending.payloadType !== undefined
        && pending.payloadType !== strippedPayloadType) continue;
      if (!oldest || pending.sentAtMs < oldest.sentAtMs) {
        oldest = { id, sentAtMs: pending.sentAtMs, source: pending.source };
      }
    }
    if (!oldest) return undefined;
    this.pendingTx.delete(oldest.id);
    const resolved = { cmdId: oldest.id, latencyMs: Math.max(0, nowTs - oldest.sentAtMs), source: oldest.source };
    this.rememberResolvedCorrelation(resolved);
    return resolved;
  }

  private rememberResolvedCorrelation(resolved: { cmdId: string; latencyMs: number; source: LogSource }): void {
    this.resolvedCorrelations.set(resolved.cmdId, resolved);
    if (this.resolvedCorrelations.size > 64) {
      const oldestKey = this.resolvedCorrelations.keys().next().value;
      if (oldestKey !== undefined) this.resolvedCorrelations.delete(oldestKey);
    }
  }

  private runTriggersForLatest(): void {
    if (this.triggers.length === 0) return;
    if (!this.isTriggersLicensed()) return;
    const all = this.store.view();
    const latest = all[all.length - 1];
    if (!latest) return;
    const result = evaluateTriggers(latest, this.triggers);
    if (result.matchedRuleIds.length === 0) return;
    if (result.highlightColor) {
      this.store.patchLast((e) => e === latest, { highlight: result.highlightColor });
    }
    if (result.beep) this.tryBeep();
    for (const n of result.notify) this.tryNotify(n.ruleName, n.message);
    if (result.pause) this.liveStreamPaused = true;
  }

  private tryBeep(): void {
    if (typeof window === 'undefined') return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.1;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      setTimeout(() => { void ctx.close(); }, 250);
    } catch { /* ignore */ }
  }

  private tryNotify(title: string, body: string): void {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, { body: body.slice(0, 240) });
      } else if (Notification.permission !== 'denied') {
        void Notification.requestPermission().then((perm) => {
          if (perm === 'granted') new Notification(title, { body: body.slice(0, 240) });
        });
      }
    } catch { /* ignore */ }
  }

  private recordSent(frame: SocketFrame): void {
    const { raw, ts } = frame;
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { /* keep raw text path */ }
    const cmdObj = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
    const cmdName = typeof cmdObj?.CMD === 'string' ? cmdObj.CMD : 'CMD';
    const payloadType = typeof cmdObj?.PAYLOAD_TYPE === 'string' ? cmdObj.PAYLOAD_TYPE : undefined;
    const hasRealId = cmdObj?.ID !== undefined;
    const cmdId = hasRealId ? String(cmdObj?.ID) : `t${String(ts)}`;
    const groupId = `rawtx-${cmdId}`;
    const correlationId = hasRealId ? cmdId : undefined;
    const source: LogSource = this.commandSourceDepth > 0 ? 'command' : 'wire';
    if (hasRealId) {
      this.pendingTx.set(cmdId, { sentAtMs: ts, txGroupId: groupId, cmd: cmdName, payloadType, source });
      this.sweepPendingTx();
    }
    if (!shouldPrint(this.eventFilters, 'sent')) {
      this.emit();
      return;
    }
    const text = payload !== undefined ? formatOutput(payload, this.outputFormat) : raw;
    this.store.push({ level: 'info', tag: 'RAW_TX', source, groupId, message: `→ ${cmdName}`, correlationId });
    this.store.push({ level: 'info', tag: 'RAW_TX', source, groupId, message: text, payload, correlationId });
    this.runTriggersForLatest();
    this.emit();
  }

  private recordReceived(frame: SocketFrame): void {
    const { raw, ts } = frame;
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { /* keep raw text path */ }
    const correlation = this.correlateAck(payload, ts);
    if (correlation) {
      const ackResult = extractAckResult(payload);
      this.store.patchByGroupId(`rawtx-${correlation.cmdId}`, {
        correlationId: correlation.cmdId,
        latencyMs: correlation.latencyMs,
        ack: {
          result: ackResult,
          latencyMs: correlation.latencyMs,
          payload,
          ts: new Date(ts).toISOString(),
        },
      });
      // Suppress the duplicate RAW_RX row: the suffix chip on the TX entry plus the
      // AckSection in LogDetailPane already surface this frame in full.
      this.emit();
      return;
    }
    if (!shouldPrint(this.eventFilters, 'raw')) {
      this.emit();
      return;
    }
    const text = payload !== undefined ? formatOutput(payload, this.outputFormat) : raw;
    const source: LogSource = 'wire';
    this.store.push({ level: 'debug', tag: 'RAW_RX', source, message: text, payload });
    this.runTriggersForLatest();
    this.emit();
  }

  private sweepPendingTx(): void {
    const cutoff = Date.now() - PENDING_TX_TIMEOUT_MS;
    for (const [id, pending] of this.pendingTx) {
      if (pending.sentAtMs < cutoff) this.pendingTx.delete(id);
    }
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
    const source: LogSource = event.type === 'raw' ? 'wire' : 'lifecycle';
    this.pendingReplayRecord.push({
      atMs: Math.max(0, Date.now() - this.recordingStartedAtMs),
      entry: {
        ts: nowIso(),
        level,
        tag,
        source,
        message: typeof event.message === 'string' ? event.message : safeJson(event.message),
      },
    });
  }

  private pushCommandMessage(text: string, groupId?: string, payload?: unknown): void {
    this.store.push({
      level: 'info',
      tag: 'LOG',
      source: 'command',
      message: text.length > 0 ? text : ' ',
      groupId,
      payload,
    });
  }

  private pushSystemMessage(text: string): void {
    this.store.push({ level: 'info', tag: 'SYSTEM', source: 'lifecycle', message: text });
  }
}
