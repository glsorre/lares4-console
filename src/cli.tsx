#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './app/App.js';
import { IntroDialog, type IntroDialogSubmit } from './app/IntroDialog.js';
import { createLaresClient } from './infra/lares-client.js';
import { LogStore } from './core/log-store.js';
import { executeCommand } from './core/command-router.js';
import { exportSession } from './core/export-session.js';
import { nowIso, safeJson, shouldPrint } from './core/utils.js';
import { DEFAULT_EVENT_FILTERS } from './core/defaults.js';
import type { EventFilter, OutputFormat, UiState } from './core/types.js';
import { CommandHistory } from './core/history.js';
import type { SocketEventEmitted } from './infra/socket-types.js';
import { getLogPaneRowCount, maxTailScrollOffset, totalRenderRowCount } from './core/log-view.js';

const sender = process.env.LARES4_SENDER ?? 'lares4 console';
const wss = process.env.LARES4_WSS !== 'false';
const envIp = process.env.LARES4_IP;
const envPin = process.env.LARES4_PIN;

async function promptConnectionConfig(initialWss: boolean): Promise<IntroDialogSubmit> {
  return await new Promise<IntroDialogSubmit>((resolve, reject) => {
    const introInstance = render(
      <IntroDialog
        initialIp={envIp ?? ''}
        initialPin={envPin ?? ''}
        initialWss={initialWss}
        onSubmit={(values) => {
          introInstance.unmount();
          resolve(values);
        }}
        onCancel={() => {
          introInstance.unmount();
          reject(new Error('Setup cancelled by user'));
        }}
      />,
      { exitOnCtrlC: false, alternateScreen: true },
    );
  });
}

async function resolveConnectionConfig(): Promise<IntroDialogSubmit> {
  if (envIp && envPin) {
    return { ip: envIp, pin: envPin, wss };
  }
  return await promptConnectionConfig(wss);
}

let laresClient: Awaited<ReturnType<typeof createLaresClient>>;
try {
  const connectionConfig = await resolveConnectionConfig();
  laresClient = await createLaresClient({
    ip: connectionConfig.ip,
    pin: connectionConfig.pin,
    sender,
    wss: connectionConfig.wss,
  });
} catch (err) {
  console.error('Failed to connect to Lares 4:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
const { lares, socket } = laresClient;
const logStore = new LogStore();
const startedAt = nowIso();
const history = new CommandHistory();
let outputFormat: OutputFormat = 'pretty';
let eventFilters = new Set<EventFilter>(DEFAULT_EVENT_FILTERS);
let connectionStatus: 'connecting' | 'online' | 'error' = 'connecting';
let lastCtrlCTs = 0;
let systemBlockSeq = 0;
let rawRxBlockSeq = 0;
let renderRowsCacheVersion = -1;
let renderRowsCacheCount = 0;
const state: UiState = {
  wrapEnabled: true,
  horizontalOffset: 0,
  rawFullEnabled: false,
  followTail: true,
  scrollOffset: 0,
  commandLine: '',
};
// Keep mutable to avoid TDZ issues before first render.
// eslint-disable-next-line prefer-const
let instance: ReturnType<typeof render> | undefined;

function eventStatus(filters: Set<EventFilter>): string {
  if (filters.has('all')) return 'all';
  if (filters.has('none') || filters.size === 0) return 'none';
  return Array.from(filters).sort().join(',');
}

function stateScopeSnapshot(scope: string): unknown {
  switch (scope) {
    case 'all':
      return {
        lights: lares.lights,
        covers: lares.covers,
        switches: lares.switches,
        gates: lares.gates,
        thermostats: lares.thermostats,
        zones: lares.zones,
        scenarios: lares.scenarios,
        system: lares.systemStatus,
        outputs: lares.outputs,
      };
    case 'lights': return lares.lights;
    case 'covers': return lares.covers;
    case 'switches': return lares.switches;
    case 'gates': return lares.gates;
    case 'thermostats': return lares.thermostats;
    case 'zones': return lares.zones;
    case 'scenarios': return lares.scenarios;
    case 'system': return lares.systemStatus;
    case 'outputs': return lares.outputs;
    default: throw new Error('Usage: state all|lights|covers|switches|gates|thermostats|zones|scenarios|system|outputs');
  }
}

function rerenderApp(): void {
  instance?.rerender(
    <App
      logStore={logStore}
      onSubmit={handleSubmit}
      onWrapToggle={handleWrapToggle}
      onRawToggle={handleRawToggle}
      onPanLeft={handlePanLeft}
      onPanRight={handlePanRight}
      onHistoryUp={handleHistoryUp}
      onHistoryDown={handleHistoryDown}
      onScrollUp={handleScrollUp}
      onScrollDown={handleScrollDown}
      onScrollPageUp={handleScrollPageUp}
      onScrollPageDown={handleScrollPageDown}
      onFollowTail={handleFollowTail}
      onScrollToOldest={handleScrollToOldest}
      onExport={handleExport}
      onCtrlC={handleCtrlC}
      state={state}
      eventsStatus={eventStatus(eventFilters)}
      connectionStatus={connectionStatus}
    />,
  );
}

const onSocketMessage = (event: SocketEventEmitted) => {
  if (event.type === 'open') {
    connectionStatus = 'online';
    rerenderApp();
    return;
  }
  if (event.type === 'close') {
    connectionStatus = 'connecting';
    rerenderApp();
    return;
  }
  if (event.type === 'error') {
    connectionStatus = 'error';
    if (shouldPrint(eventFilters, 'errors')) {
      logStore.push({ level: 'error', tag: 'ERROR', message: typeof event.message === 'string' ? event.message : safeJson(event.message) });
    }
    rerenderApp();
    return;
  }
  connectionStatus = 'online';
  if (event.type === 'raw' && shouldPrint(eventFilters, 'raw')) {
    const raw = String(event.message ?? '');
    if (state.rawFullEnabled) {
      try {
        logStore.push({ level: 'debug', tag: 'RAW_RX', message: 'frame', payload: JSON.parse(raw) });
      } catch {
        pushRawRxChunked(raw);
      }
    } else {
      pushRawRxChunked(raw);
    }
  }
  if (event.type === 'response' && shouldPrint(eventFilters, 'acks')) {
    logStore.push({ level: 'info', tag: 'ACK', message: typeof event.message === 'string' ? event.message : safeJson(event.message) });
  }
  if (event.type === 'multi_types' && shouldPrint(eventFilters, 'multitypes')) {
    logStore.push({ level: 'info', tag: 'MULTI_TYPES', message: typeof event.message === 'string' ? event.message : safeJson(event.message) });
  }
  if (event.type === 'change' && shouldPrint(eventFilters, 'changes')) {
    logStore.push({ level: 'info', tag: 'CHANGE', message: typeof event.message === 'string' ? event.message : safeJson(event.message) });
  }
  rerenderApp();
};

const unsubscribeSocket = socket.messages.subscribe(onSocketMessage);

function nextSystemBlockId(): string {
  systemBlockSeq += 1;
  return `sys-${String(systemBlockSeq)}`;
}

function nextRawRxBlockId(): string {
  rawRxBlockSeq += 1;
  return `raw-rx-${String(rawRxBlockSeq)}`;
}

/** Soft cap per frame so a pathological payload cannot blow the log store. */
const RAW_RX_FRAME_MAX_CHARS = 512 * 1024;

/** Newline-split only so Ink wraps long lines to the real ScrollView width (avoid stdout-width guesses). */
function pushRawRxChunked(text: string): void {
  const blockId = nextRawRxBlockId();
  const body = text.length > RAW_RX_FRAME_MAX_CHARS
    ? `${text.slice(0, RAW_RX_FRAME_MAX_CHARS)}… [truncated ${String(text.length - RAW_RX_FRAME_MAX_CHARS)} chars]`
    : text;
  for (const line of body.split('\n')) {
    logStore.push({
      level: 'debug',
      tag: 'RAW_RX',
      message: line.length > 0 ? line : ' ',
      groupId: blockId,
    });
  }
}

/** Split on `\n` only; long lines use Ink/Text wrap inside the pane. */
function pushSystemMessage(text: string): void {
  const blockId = nextSystemBlockId();
  const lines = text.split('\n');
  if (lines.length === 1 && lines[0] !== undefined) {
    logStore.push({ level: 'info', tag: 'SYSTEM', message: lines[0], groupId: blockId });
    return;
  }
  for (const line of lines) {
    logStore.push({
      level: 'info',
      tag: 'SYSTEM',
      message: line.length > 0 ? line : ' ',
      groupId: blockId,
    });
  }
}

async function handleSubmit(line: string): Promise<void> {
  history.add(line);
  try {
    const lines = await executeCommand(line, {
      lares,
      socketSend: socket.send,
      outputFormat,
      eventFilters,
      onEventFiltersChanged: (next) => {
        eventFilters = next;
        logStore.push({ level: 'info', tag: 'SYSTEM', message: `Events listened: ${eventStatus(eventFilters)}` });
      },
      onFormatChanged: (fmt) => { outputFormat = fmt; },
      rawFullEnabled: state.rawFullEnabled,
      onRawFullChanged: (enabled) => { state.rawFullEnabled = enabled; },
      onExport: async (path) => exportSession(logStore.all(), {
        sender,
        format: outputFormat,
        events: Array.from(eventFilters).join(','),
        startedAt,
      }, path),
      getStateSnapshot: stateScopeSnapshot,
    });
    for (const text of lines) {
      if (text === '__EXIT__') {
        unsubscribeSocket();
        lares.close();
        process.exit(0);
      }
      pushSystemMessage(text);
    }
  } catch (error) {
    logStore.push({ level: 'error', tag: 'ERROR', message: error instanceof Error ? error.message : String(error) });
  }
  state.scrollOffset = 0;
  state.followTail = true;
  rerenderApp();
}

function handleWrapToggle(): void {
  state.wrapEnabled = !state.wrapEnabled;
  if (state.wrapEnabled) {
    state.horizontalOffset = 0;
  }
  logStore.push({ level: 'info', tag: 'SYSTEM', message: `Wrap mode set to: ${state.wrapEnabled ? 'on' : 'off'}` });
  rerenderApp();
}

function handleRawToggle(): void {
  state.rawFullEnabled = !state.rawFullEnabled;
  logStore.push({ level: 'info', tag: 'SYSTEM', message: `Raw full mode set to: ${state.rawFullEnabled ? 'on' : 'off'}` });
  rerenderApp();
}

function handlePanLeft(): void {
  if (!state.wrapEnabled) {
    state.horizontalOffset = Math.max(0, state.horizontalOffset - 8);
  }
  rerenderApp();
}

function handlePanRight(): void {
  if (!state.wrapEnabled) {
    state.horizontalOffset += 8;
  }
  rerenderApp();
}

function handleHistoryUp(prefix: string): string | undefined {
  return history.previous(prefix);
}

function handleHistoryDown(prefix: string): string | undefined {
  return history.next(prefix);
}

function clampScrollOffset(): void {
  const totalRows = getTotalRenderRows();
  const paneRows = getLogPaneRowCount();
  const maxOffset = Math.max(0, totalRows - paneRows);
  const before = state.scrollOffset;
  state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxOffset));
  if (before !== state.scrollOffset) {
    state.followTail = state.scrollOffset === 0;
  }
}

function getTotalRenderRows(): number {
  const version = logStore.version();
  if (version !== renderRowsCacheVersion) {
    renderRowsCacheCount = totalRenderRowCount(Array.from(logStore.view()));
    renderRowsCacheVersion = version;
  }
  return renderRowsCacheCount;
}

function handleScrollUp(lines: number = 1): void {
  state.scrollOffset += Math.max(1, lines);
  state.followTail = false;
  clampScrollOffset();
  rerenderApp();
}

function handleScrollDown(lines: number = 1): void {
  state.scrollOffset -= Math.max(1, lines);
  clampScrollOffset();
  state.followTail = state.scrollOffset === 0;
  rerenderApp();
}

function handleScrollPageUp(lines?: number): void {
  state.scrollOffset += Math.max(1, lines ?? getLogPaneRowCount());
  state.followTail = false;
  clampScrollOffset();
  rerenderApp();
}

function handleScrollPageDown(lines?: number): void {
  state.scrollOffset -= Math.max(1, lines ?? getLogPaneRowCount());
  clampScrollOffset();
  state.followTail = state.scrollOffset === 0;
  rerenderApp();
}

function handleFollowTail(): void {
  state.scrollOffset = 0;
  state.followTail = true;
  rerenderApp();
}

function handleScrollToOldest(): void {
  state.scrollOffset = maxTailScrollOffset(getTotalRenderRows(), getLogPaneRowCount());
  state.followTail = false;
  clampScrollOffset();
  rerenderApp();
}

async function handleExport(): Promise<void> {
  const out = await exportSession(logStore.all(), {
    sender,
    format: outputFormat,
    events: Array.from(eventFilters).join(','),
    startedAt,
  });
  logStore.push({ level: 'info', tag: 'SYSTEM', message: `Session exported to: ${out}` });
  rerenderApp();
}

function handleCtrlC(): void {
  const now = Date.now();
  if (now - lastCtrlCTs <= 1500) {
    unsubscribeSocket();
    lares.close();
    process.exit(0);
  }
  lastCtrlCTs = now;
  logStore.push({ level: 'warn', tag: 'SYSTEM', message: 'Press Ctrl+C again within 1.5s to quit lares4 console' });
  rerenderApp();
}

instance = render(
  <App
    logStore={logStore}
    onSubmit={handleSubmit}
    onWrapToggle={handleWrapToggle}
    onRawToggle={handleRawToggle}
    onPanLeft={handlePanLeft}
    onPanRight={handlePanRight}
    onHistoryUp={handleHistoryUp}
    onHistoryDown={handleHistoryDown}
    onScrollUp={handleScrollUp}
    onScrollDown={handleScrollDown}
    onScrollPageUp={handleScrollPageUp}
    onScrollPageDown={handleScrollPageDown}
    onFollowTail={handleFollowTail}
    onScrollToOldest={handleScrollToOldest}
    onExport={handleExport}
    onCtrlC={handleCtrlC}
    state={state}
    eventsStatus={eventStatus(eventFilters)}
    connectionStatus={connectionStatus}
  />,
  { exitOnCtrlC: false, alternateScreen: true },
);

if (process.stdout.isTTY) {
  process.stdout.on('resize', () => {
    clampScrollOffset();
    rerenderApp();
  });
}

function shutdown(code: number): never {
  unsubscribeSocket();
  lares.close();
  process.exit(code);
}
process.on('SIGTERM', () => { shutdown(0); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown(1);
});
