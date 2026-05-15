import { LogStore, type Bookmark } from '../../core/log-store.js';
import { buildTopology, type TopologySnapshot } from '../../core/topology.js';
import { adaptLares4Topology } from './topology-adapter.js';
import { evaluateTriggers } from '@pro/triggers/engine.js';
import type { TriggerRule } from '@pro/triggers/types.js';
import { DEFAULT_EVENT_FILTERS } from '../../core/defaults.js';
import { executeCommand } from '../../core/command-router.js';
import type { EventFilter, LogEntry, LogSource, LogTag, OutputFormat } from '../../core/types.js';
import { nowIso, formatOutput, formatUnknownError, isPlaceholderErrorMessage, shouldPrint } from '../../core/utils.js';
import { createLaresClient, type ClientEnv, type CreateLaresClientOptions } from '../../infra/lares-client.js';
import type { SocketCloseInfo, SocketErrorInfo, SocketFrame } from '../../infra/socket-emitter.js';
import type { SocketEventEmitted } from '../../infra/socket-types.js';
import { CommandHistory } from '../../core/history.js';
import { DesktopProfilesRepository } from './profiles-repository-desktop.js';
import { resolveDefaultSessionPath, writeUtf8File } from './tauri-fs.js';
import type { Macro, MacroStep } from '@pro/macros/types.js';
import { MacroEngine } from '@pro/macros/engine.js';
import { isFeatureLicensed } from './commercial-license-prefs.js';
import { isReadOnlyMode, setReadOnlyMode, subscribeReadOnlyMode } from './read-only-prefs.js';
import { createReadOnlyGuard, ReadOnlyBlockedError } from './read-only-guard.js';

type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'error';

const PENDING_TX_TIMEOUT_MS = 30_000;
/** Upper bound on the wire-frame → typed-event pairing window. Larger than any plausible
 *  in-flight dispatch delay; smaller than the panel's ~10s heartbeat so cross-heartbeat
 *  stashes never confuse the pairer. */
const WIRE_PENDING_TTL_MS = 2_000;
const WIRE_PENDING_MAX = 32;

/** Deterministic JSON stringify (sorted keys) so two structurally equal payloads emitted
 *  from different code paths still produce the same key. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Extract the body that lares4-ts will publish as the `change`/`multi_types` event message.
 *  For an unsolicited REALTIME frame this is `wirePayload.PAYLOAD`; for a typed event keyed
 *  on PAYLOAD_TYPE the message is `{sender: {PAYLOAD_TYPE: PAYLOAD[PAYLOAD_TYPE]}}`. We
 *  match on `PAYLOAD` (the broader of the two) so the recency fallback handles the narrower
 *  case without false positives. */
function extractWirePayloadBody(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  return (payload as Record<string, unknown>).PAYLOAD;
}

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

export class SessionController {
  private readonly store = new LogStore();
  private readonly history = new CommandHistory();
  private readonly deps: SessionControllerDeps;
  private readonly profiles: DesktopProfilesRepository;
  private readonly listeners = new Set<() => void>();
  private outputFormat: OutputFormat = 'pretty';
  private eventFilters = new Set<EventFilter>(DEFAULT_EVENT_FILTERS);
  private connectionStatus: ConnectionStatus = 'idle';
  private commandLine = '';
  private connected = false;
  private error: string | undefined;
  private lares: Awaited<ReturnType<typeof createLaresClient>>['lares'] | undefined;
  private socket: Awaited<ReturnType<typeof createLaresClient>>['socket'] | undefined;
  private unsubscribeSocket: (() => void) | undefined;
  private logTagFilters: LogTag[] | undefined;
  private activeProfileName: string | undefined;
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
  /** Monotonic counter for wire-frame group ids. Increments per RAW_RX push. */
  private wireSeq = 0;
  /** Stash of recent wire frames awaiting a typed-event partner.
   *  Keyed by the monotonic `wireSeq` so two frames arriving in the same ms tick do not
   *  overwrite each other (Map.set collisions silently drop the earlier stash). The wire-
   *  frame ts is stored on the entry for age-based sweeping. Bounded by `WIRE_PENDING_MAX`
   *  entries and `WIRE_PENDING_TTL_MS` age. */
  private readonly wirePending = new Map<number, {
    groupId: string;
    payload: unknown;
    message: string;
    rendered: boolean;
    /** Wire-frame ts (epoch ms) used by `sweepWirePending` to expire stale entries. */
    ts: number;
    /** Stringified `PAYLOAD` body, lazy-cached for structural pairing. */
    payloadKey?: string;
  }>();
  private liveStreamPaused = false;
  private readOnly = false;
  private unsubscribeReadOnly: (() => void) | undefined;
  private lastSocketClose: SocketCloseInfo | undefined;
  private lastSocketError: SocketErrorInfo | undefined;
  /** Snapshot-stability caches. Selector hooks rely on identity equality to skip
   *  re-renders on unrelated `emit()` calls, so these slices must keep the same
   *  array/object reference until their underlying source actually changes. */
  private cachedEventFilters: EventFilter[] = [];
  private cachedEventFiltersSize = -1;
  private cachedLicensed: SessionSnapshot['licensed'] = {
    macros: false, tabs: false, triggers: false, annotations: false, multiwindow: false,
  };
  private cachedLogEntries: LogEntry[] = [];
  private cachedLogEntriesVersion = -1;
  private cachedBookmarks: Bookmark[] = [];
  private cachedBookmarksVersion = -1;

  constructor(deps: SessionControllerDeps = {}) {
    this.deps = deps;
    this.profiles = deps.profiles ?? new DesktopProfilesRepository();
    this.isMacrosLicensed = deps.isMacrosLicensed ?? (() => isFeatureLicensed('macros'));
    this.isTabsLicensed = deps.isTabsLicensed ?? (() => isFeatureLicensed('tabs'));
    this.isTriggersLicensed = deps.isTriggersLicensed ?? (() => isFeatureLicensed('triggers'));
    this.isAnnotationsLicensed = deps.isAnnotationsLicensed ?? (() => isFeatureLicensed('annotations'));
    this.isMultiwindowLicensed = deps.isMultiwindowLicensed ?? (() => isFeatureLicensed('multiwindow'));
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
      outputFormat: this.outputFormat,
      eventFilters: this.snapshotEventFilters(),
      logEntries: this.snapshotLogEntries(),
      commandLine: this.commandLine,
      error: this.error,
      logTagFilters: this.logTagFilters,
      activeProfileName: this.activeProfileName,
      macros: this.macros,
      activeMacro,
      recordingMacro: this.macroRecordingBuffer !== undefined,
      recordingMacroSteps: this.macroRecordingBuffer?.length ?? 0,
      topology: this.computeTopology(),
      bookmarks: this.snapshotBookmarks(),
      triggers: this.triggers,
      pendingTxCount: this.pendingTx.size,
      liveStreamPaused: this.liveStreamPaused,
      readOnly: this.readOnly,
      licensed: this.snapshotLicensed(),
    };
  }

  private snapshotEventFilters(): EventFilter[] {
    if (this.cachedEventFiltersSize !== this.eventFilters.size) {
      this.cachedEventFilters = Array.from(this.eventFilters);
      this.cachedEventFiltersSize = this.eventFilters.size;
    }
    return this.cachedEventFilters;
  }

  private snapshotLogEntries(): LogEntry[] {
    const version = this.store.version();
    if (this.cachedLogEntriesVersion !== version) {
      this.cachedLogEntries = this.store.all();
      this.cachedLogEntriesVersion = version;
    }
    return this.cachedLogEntries;
  }

  private snapshotBookmarks(): Bookmark[] {
    const version = this.store.version();
    if (this.cachedBookmarksVersion !== version) {
      this.cachedBookmarks = this.store.listBookmarks();
      this.cachedBookmarksVersion = version;
    }
    return this.cachedBookmarks;
  }

  private snapshotLicensed(): SessionSnapshot['licensed'] {
    const next = {
      macros: this.isMacrosLicensed(),
      tabs: this.isTabsLicensed(),
      triggers: this.isTriggersLicensed(),
      annotations: this.isAnnotationsLicensed(),
      multiwindow: this.isMultiwindowLicensed(),
    };
    const cur = this.cachedLicensed;
    if (cur.macros === next.macros && cur.tabs === next.tabs && cur.triggers === next.triggers
        && cur.annotations === next.annotations && cur.multiwindow === next.multiwindow) {
      return cur;
    }
    this.cachedLicensed = next;
    return next;
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
        getStateSnapshot: (scope) => this.stateScopeSnapshot(scope),
      }));
      const typedCommand = line.trim();
      let firstPush = true;
      for (const item of items) {
        const command = firstPush && typedCommand.length > 0 ? typedCommand : undefined;
        if (typeof item === 'string') {
          this.pushCommandMessage(item, groupId, undefined, command);
        } else {
          this.pushCommandMessage(item.text, groupId, item.payload, command);
        }
        firstPush = false;
      }
    } catch (error) {
      const typedCommand = line.trim();
      const command = typedCommand.length > 0 ? typedCommand : undefined;
      if (error instanceof ReadOnlyBlockedError) {
        this.store.push({
          level: 'warn',
          tag: 'SYSTEM',
          source: 'command',
          message: error.message,
          groupId,
          command,
        });
      } else {
        this.store.push({
          level: 'error',
          tag: 'ERROR',
          source: 'command',
          message: error instanceof Error ? error.message : String(error),
          groupId,
          command,
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

  async exportLogs(path: string, savedMessage?: (path: string) => string): Promise<string> {
    try {
      const saved = await this.exportSession(path);
      const text = savedMessage ? savedMessage(saved) : `Exported logs to ${saved}`;
      this.pushSystemMessage(text);
      this.emit();
      return saved;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.store.push({ level: 'error', tag: 'ERROR', source: 'lifecycle', message: text });
      this.emit();
      throw error;
    }
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
        const claim = this.consumePendingWire(payload);
        this.store.push({
          level: 'info', tag: 'CHANGE', source: 'lifecycle', message: text, payload,
          groupId: claim?.groupId, wireFrame: claim?.wireFrame,
        });
        pushed = true;
      }
    } else if (event.type === 'multi_types' && shouldPrint(this.eventFilters, 'multitypes')) {
      const { text, payload } = this.coerceEventMessage(event.message);
      const claim = this.consumePendingWire(payload);
      this.store.push({
        level: 'info', tag: 'BULK', source: 'lifecycle', message: text, payload,
        groupId: claim?.groupId, wireFrame: claim?.wireFrame,
      });
      pushed = true;
    }
    if (pushed) this.runTriggersForLatest();
    this.emit();
  }

  /** Heuristic: does this payload look like a panel response (vs. an unsolicited notification)?
   *  Unsolicited frames such as STATUS_SYSTEMS must not be swallowed by the CMD-pair fallback
   *  in `correlateAck`, otherwise their RAW_RX row is suppressed and the decoded CHANGE row
   *  loses its wire-frame pairing. Real responses always carry one of these markers. */
  private isAckShaped(obj: Record<string, unknown>): boolean {
    if ('RESULT' in obj) return true;
    const pt = typeof obj.PAYLOAD_TYPE === 'string' ? obj.PAYLOAD_TYPE : undefined;
    if (pt?.endsWith('_ACK')) return true;
    const cmd = typeof obj.CMD === 'string' ? obj.CMD : undefined;
    if (cmd?.endsWith('_RES')) return true;
    const inner = obj.PAYLOAD;
    if (inner && typeof inner === 'object' && !Array.isArray(inner) && 'RESULT' in (inner as Record<string, unknown>)) return true;
    return false;
  }

  private correlateAck(payload: unknown, nowTs: number = Date.now()): { cmdId: string; latencyMs: number; source: LogSource } | undefined {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
    const obj = payload as Record<string, unknown>;
    if (!this.isAckShaped(obj)) return undefined;
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
    this.sweepWirePending(frame.ts);
    const { raw, ts } = frame;
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { /* keep raw text path */ }
    const text = payload !== undefined ? formatOutput(payload, this.outputFormat) : raw;
    const seq = ++this.wireSeq;
    const wireGroupId = `wire-${String(seq)}`;
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
      // AckSection in LogDetailPane already surface this frame in full. Still publish the
      // wire-metadata sidecar so any change/multi_types event lares4-ts emits synchronously
      // from this response payload can attach its `wireFrame` and share a groupId.
      this.stashWirePending(seq, { groupId: wireGroupId, payload, message: text, rendered: false, ts });
      this.emit();
      return;
    }
    const rendered = shouldPrint(this.eventFilters, 'raw');
    // Stash wire metadata unconditionally so a following CHANGE/BULK can claim the groupId.
    // When raw filter is on the RAW_RX row carries the payload (log-view links via groupId);
    // when off the sidecar payload is attached directly to the decoded entry's `wireFrame`.
    this.stashWirePending(seq, { groupId: wireGroupId, payload, message: text, rendered, ts });
    if (!rendered) {
      this.emit();
      return;
    }
    const source: LogSource = 'wire';
    this.store.push({ level: 'debug', tag: 'RAW_RX', source, message: text, payload, groupId: wireGroupId });
    this.runTriggersForLatest();
    this.emit();
  }

  private stashWirePending(
    seq: number,
    entry: { groupId: string; payload: unknown; message: string; rendered: boolean; ts: number },
  ): void {
    this.wirePending.set(seq, entry);
    if (this.wirePending.size > WIRE_PENDING_MAX) {
      const oldestKey = this.wirePending.keys().next().value;
      if (oldestKey !== undefined) this.wirePending.delete(oldestKey);
    }
  }

  /** Drop stashes whose wire ts is older than `nowTs - WIRE_PENDING_TTL_MS`. Keeps the map
   *  bounded across long-lived sessions without depending on a next-frame heuristic. */
  private sweepWirePending(nowTs: number): void {
    if (this.wirePending.size === 0) return;
    const cutoff = nowTs - WIRE_PENDING_TTL_MS;
    for (const [key, entry] of this.wirePending) {
      if (entry.ts < cutoff) this.wirePending.delete(key);
      else break; // Map preserves insertion order; wireSeq is monotonic.
    }
  }

  /** Locate the wire-frame stash that paired with a given typed event.
   *  Prefer a structural match on the decoded payload body; fall back to the most-recent
   *  stash within `WIRE_PENDING_TTL_MS` (recency is sufficient because typed events from
   *  lares4-ts are dispatched in the order their wire frames arrived).
   *
   *  Non-destructive: leaves the stash in place so a burst of typed events emitted
   *  synchronously from the same wire frame can all share the groupId. Aging via
   *  `sweepWirePending` and the `WIRE_PENDING_MAX` bound prevent unbounded growth. */
  private consumePendingWire(
    eventPayload?: unknown,
  ): { groupId: string; wireFrame?: LogEntry['wireFrame']; ts: number } | undefined {
    if (this.wirePending.size === 0) return undefined;
    const eventKey = eventPayload !== undefined ? stableStringify(eventPayload) : undefined;
    let matchedKey: number | undefined;
    if (eventKey !== undefined) {
      // Walk newest → oldest so the most recent structural twin wins.
      const keys = Array.from(this.wirePending.keys());
      for (let i = keys.length - 1; i >= 0; i -= 1) {
        const key = keys[i]!;
        const entry = this.wirePending.get(key)!;
        const wirePayloadBody = extractWirePayloadBody(entry.payload);
        if (wirePayloadBody === undefined) continue;
        const wireKey = entry.payloadKey ?? stableStringify(wirePayloadBody);
        entry.payloadKey = wireKey;
        if (wireKey === eventKey) { matchedKey = key; break; }
      }
    }
    if (matchedKey === undefined) {
      // Fall back to the most-recent stash (latest insertion order in a Map).
      const keys = Array.from(this.wirePending.keys());
      matchedKey = keys[keys.length - 1];
    }
    if (matchedKey === undefined) return undefined;
    const stash = this.wirePending.get(matchedKey)!;
    const wireFrame = !stash.rendered
      ? { payload: stash.payload, content: stash.message, ts: new Date(stash.ts).toISOString() }
      : undefined;
    return { groupId: stash.groupId, wireFrame, ts: stash.ts };
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

  private pushCommandMessage(text: string, groupId?: string, payload?: unknown, command?: string): void {
    this.store.push({
      level: 'info',
      tag: 'LOG',
      source: 'command',
      message: text.length > 0 ? text : ' ',
      groupId,
      payload,
      command,
    });
  }

  private pushSystemMessage(text: string): void {
    this.store.push({ level: 'info', tag: 'SYSTEM', source: 'lifecycle', message: text });
  }
}
