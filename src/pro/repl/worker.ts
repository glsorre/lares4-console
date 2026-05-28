// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.
//
// Web Worker entrypoint for the REPL. Receives `eval(body)` from main thread
// and runs it inside an AsyncFunction with `client`, `sleep`, `print`,
// `waitFor` bound. Cancellation is by termination — the host calls
// `worker.terminate()` and respawns on next Run.

import * as Comlink from 'comlink';

interface HostAPI {
  getClient(): Promise<unknown>;
  print(args: string[]): void;
  waitFor(matcherSrc: string, timeoutMs: number): Promise<unknown>;
}

type EvalResult = { value?: unknown } | { error: { message: string; stack?: string } };

const remote = Comlink.wrap<HostAPI>(self as unknown as Comlink.Endpoint);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatArg(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function print(...args: unknown[]): void {
  void remote.print(args.map(formatArg));
}

async function waitFor(
  matcher: (entry: unknown) => boolean,
  opts?: { timeout?: number },
): Promise<unknown> {
  if (typeof matcher !== 'function') {
    throw new TypeError('waitFor: matcher must be a function');
  }
  return await remote.waitFor(matcher.toString(), opts?.timeout ?? 30_000);
}

const AsyncFunctionCtor = (async function emptyAsync() { /* probe */ })
  .constructor as new (...args: string[]) => (...inner: unknown[]) => Promise<unknown>;

function serializeResult(value: unknown): unknown {
  // The result must structured-clone across the worker boundary. If it can't (e.g. it carries
  // a Comlink proxy, a class instance, a function), fall back to JSON and finally to a string.
  try { structuredClone(value); return value; } catch { /* fallthrough */ }
  try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}

function sliceUserStack(stack: string | undefined): string | undefined {
  if (stack === undefined || stack.length === 0) return undefined;
  return stack
    .split('\n')
    .filter((line) => !/AsyncFunction|repl\/worker\.ts|node:internal/.test(line))
    .join('\n')
    .trim() || undefined;
}

async function evalBody(body: string): Promise<EvalResult> {
  try {
    const client = await remote.getClient();
    const fn = new AsyncFunctionCtor('client', 'sleep', 'print', 'waitFor', body);
    const value = await fn(client, sleep, print, waitFor);
    return { value: serializeResult(value) };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const sliced = sliceUserStack(error.stack);
    return { error: sliced !== undefined ? { message: error.message, stack: sliced } : { message: error.message } };
  }
}

const workerAPI = {
  eval: evalBody,
};

Comlink.expose(workerAPI, self as unknown as Comlink.Endpoint);

export type WorkerAPI = typeof workerAPI;
