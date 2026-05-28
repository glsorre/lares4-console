// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import * as Comlink from 'comlink';
import type { LogEntry } from '@/core/types.js';
import type { LogStore } from '@/core/log-store.js';
import type { ReplEntry } from './types.js';
import type { WorkerAPI } from './worker.js';

export interface ReplEvalDeps {
  /** Live `lares4-ts` client for the active session, or `undefined` if not connected. Re-read
   *  on every eval so disconnect/reconnect always lands on the current instance. */
  getLares: () => unknown;
  /** Log store for the active session — `waitFor` subscribes to new entries here. */
  getLogStore: () => LogStore;
  /** UI callback: append a row to the REPL scrollback. */
  appendEntry: (entry: ReplEntry) => void;
  /** Factory hook for tests; production uses `new Worker(new URL('./worker.ts', …))`. */
  spawnWorker?: () => Worker;
}

interface EvalResult {
  value?: unknown;
  error?: { message: string; stack?: string };
}

function defaultSpawnWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

let nextEntryCounter = 0;
function makeEntryId(): string {
  nextEntryCounter += 1;
  return `r${String(nextEntryCounter)}-${String(Date.now())}`;
}

/** Standalone `waitFor` handler used by the host's Comlink-exposed API. Extracted so tests
 *  can drive it directly against a controlled `LogStore` without spawning a worker. */
export function createWaitForHandler(
  getLogStore: () => LogStore,
): (matcherSrc: string, timeoutMs: number) => Promise<LogEntry> {
  return (matcherSrc: string, timeoutMs: number) => new Promise<LogEntry>((resolve, reject) => {
    let matcher: (entry: LogEntry) => boolean;
    try {
      const compiled = new Function(`return (${matcherSrc});`)() as unknown;
      if (typeof compiled !== 'function') throw new Error('matcher is not a function');
      matcher = compiled as (entry: LogEntry) => boolean;
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const store = getLogStore();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribeEntries((entry) => {
      let matched = false;
      try { matched = matcher(entry); } catch { /* swallow predicate errors */ }
      if (!matched) return;
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
      resolve(entry);
    });
    timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`waitFor: timeout after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });
}

function formatResult(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export class ReplEvalHost {
  private worker: Worker | null = null;
  private workerProxy: Comlink.Remote<WorkerAPI> | null = null;
  private busy = false;
  private readonly deps: ReplEvalDeps;
  private readonly listeners = new Set<() => void>();

  constructor(deps: ReplEvalDeps) {
    this.deps = deps;
  }

  dispose(): void {
    this.terminate();
    this.listeners.clear();
  }

  /** Stop = terminate the worker. The next call to `run` spawns a fresh one and any in-script
   *  state (`const x = 1`) is lost — accepted in the plan. */
  stop(): void {
    this.terminate();
  }

  isBusy(): boolean {
    return this.busy;
  }

  /** Subscribe to busy-state changes (Run → busy=true, completion/stop → busy=false). */
  subscribeBusy(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async run(body: string): Promise<void> {
    if (body.trim().length === 0) return;
    this.deps.appendEntry({ id: makeEntryId(), ts: new Date().toISOString(), kind: 'input', text: body });
    this.setBusy(true);
    const proxy = this.ensureWorker();
    try {
      const result = (await proxy.eval(body)) as EvalResult;
      if (result.error) {
        this.deps.appendEntry({
          id: makeEntryId(),
          ts: new Date().toISOString(),
          kind: 'error',
          text: result.error.stack !== undefined && result.error.stack.length > 0
            ? `${result.error.message}\n${result.error.stack}`
            : result.error.message,
        });
      } else {
        this.deps.appendEntry({
          id: makeEntryId(),
          ts: new Date().toISOString(),
          kind: 'result',
          text: formatResult(result.value),
        });
      }
    } catch (err) {
      // Transport error (worker terminated mid-eval) or Comlink envelope failure.
      const message = err instanceof Error ? err.message : String(err);
      this.deps.appendEntry({
        id: makeEntryId(),
        ts: new Date().toISOString(),
        kind: 'error',
        text: message,
      });
      this.terminate();
    } finally {
      this.setBusy(false);
    }
  }

  private setBusy(value: boolean): void {
    if (this.busy === value) return;
    this.busy = value;
    for (const listener of this.listeners) {
      try { listener(); } catch { /* ignore */ }
    }
  }

  private ensureWorker(): Comlink.Remote<WorkerAPI> {
    if (this.workerProxy) return this.workerProxy;
    const spawn = this.deps.spawnWorker ?? defaultSpawnWorker;
    const worker = spawn();
    this.worker = worker;
    const host = this.buildHostAPI();
    Comlink.expose(host, worker as unknown as Comlink.Endpoint);
    this.workerProxy = Comlink.wrap<WorkerAPI>(worker as unknown as Comlink.Endpoint);
    return this.workerProxy;
  }

  private terminate(): void {
    if (this.worker !== null) {
      this.worker.terminate();
      this.worker = null;
      this.workerProxy = null;
    }
    this.setBusy(false);
  }

  private buildHostAPI() {
    const deps = this.deps;
    const waitFor = createWaitForHandler(deps.getLogStore);
    return {
      getClient(): unknown {
        const lares = deps.getLares();
        if (lares === undefined || lares === null) {
          throw new Error('No active connection. Connect to a panel before running scripts.');
        }
        return Comlink.proxy(lares);
      },
      print(args: string[]): void {
        deps.appendEntry({
          id: makeEntryId(),
          ts: new Date().toISOString(),
          kind: 'print',
          text: args.join(' '),
        });
      },
      waitFor,
    };
  }
}
