// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in src/pro/repl.
//
// End-to-end integration test for `ReplEvalHost`. node:test has no Web Worker,
// but Comlink endpoints only need `postMessage` / `addEventListener` /
// `removeEventListener` — happy-dom's `MessageChannel` satisfies the contract.
// One port is fed to `ReplEvalHost` via the `spawnWorker` seam; the other port
// stands in for the worker side and hand-rolls the `eval(...)` contract while
// reaching back to the host through the same bridge under test.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as Comlink from 'comlink';
import { LogStore } from '@/core/log-store.js';
import { ReplEvalHost } from '../eval-host.js';
import type { ReplEntry } from '../types.js';

interface HostAPI {
  getClient(): unknown;
  print(args: string[]): void;
  waitFor(matcherSrc: string, timeoutMs: number): Promise<unknown>;
}

interface EvalResult { value?: unknown; error?: { message: string; stack?: string } }

interface FakeWorkerHandle {
  worker: Worker;
  cleanup: () => void;
  terminated: () => boolean;
}

/** Stand up both Comlink endpoints over a `MessageChannel`. `port1` is wrapped as the
 *  "Worker" for `ReplEvalHost`; `port2` hosts the supplied fake `eval` impl and exposes a
 *  Comlink-wrapped `HostAPI` so the fake can drive `print` / `waitFor` round-trips through
 *  the real bridge. */
function makeFakeWorker(
  evalImpl: (body: string, host: Comlink.Remote<HostAPI>) => Promise<EvalResult>,
): FakeWorkerHandle {
  const channel = new MessageChannel();
  const port1 = channel.port1;
  const port2 = channel.port2;

  const hostFromWorker = Comlink.wrap<HostAPI>(port2 as unknown as Comlink.Endpoint);
  Comlink.expose(
    { eval: (body: string) => evalImpl(body, hostFromWorker) },
    port2 as unknown as Comlink.Endpoint,
  );

  let terminated = false;
  const fakeWorker: Partial<Worker> = {
    postMessage: (msg: unknown, transfer?: Transferable[] | StructuredSerializeOptions) => {
      if (Array.isArray(transfer)) port1.postMessage(msg, transfer);
      else port1.postMessage(msg);
    },
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (listener) port1.addEventListener(type, listener as EventListener);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (listener) port1.removeEventListener(type, listener as EventListener);
    },
    terminate: () => {
      terminated = true;
      try { port1.close(); } catch { /* ignore */ }
      try { port2.close(); } catch { /* ignore */ }
    },
  };
  return {
    worker: fakeWorker as Worker,
    cleanup: () => {
      if (terminated) return;
      try { port1.close(); } catch { /* ignore */ }
      try { port2.close(); } catch { /* ignore */ }
    },
    terminated: () => terminated,
  };
}

function makeHost(opts: {
  spawn: () => Worker;
  store?: LogStore;
  lares?: unknown;
}): { host: ReplEvalHost; entries: ReplEntry[]; store: LogStore } {
  const entries: ReplEntry[] = [];
  const store = opts.store ?? new LogStore();
  const host = new ReplEvalHost({
    getLares: () => opts.lares,
    getLogStore: () => store,
    appendEntry: (e) => entries.push(e),
    spawnWorker: opts.spawn,
  });
  return { host, entries, store };
}

describe('ReplEvalHost round-trip via MessageChannel', () => {
  it('routes a returned value back as a result row', async () => {
    const wk = makeFakeWorker(async (body) => {
      assert.equal(body, '1 + 1');
      return { value: 2 };
    });
    const { host, entries } = makeHost({ spawn: () => wk.worker });
    try {
      await host.run('1 + 1');
      assert.equal(entries.length, 2);
      assert.equal(entries[0].kind, 'input');
      assert.equal(entries[0].text, '1 + 1');
      assert.equal(entries[1].kind, 'result');
      assert.equal(entries[1].text, '2');
    } finally {
      host.dispose();
      wk.cleanup();
    }
  });

  it('routes a returned error back as an error row', async () => {
    const wk = makeFakeWorker(async () => ({ error: { message: 'boom', stack: 'at user:1' } }));
    const { host, entries } = makeHost({ spawn: () => wk.worker });
    try {
      await host.run('throw new Error("boom")');
      assert.equal(entries.length, 2);
      assert.equal(entries[1].kind, 'error');
      assert.match(entries[1].text, /boom/);
      assert.match(entries[1].text, /at user:1/);
    } finally {
      host.dispose();
      wk.cleanup();
    }
  });

  it('routes print() calls from the worker into scrollback', async () => {
    const wk = makeFakeWorker(async (_body, host) => {
      await host.print(['hello', 'world']);
      return { value: undefined };
    });
    const { host, entries } = makeHost({ spawn: () => wk.worker });
    try {
      await host.run('print("hello","world")');
      const printRow = entries.find((e) => e.kind === 'print');
      assert.ok(printRow, 'expected a print row');
      assert.equal(printRow.text, 'hello world');
    } finally {
      host.dispose();
      wk.cleanup();
    }
  });

  it("resolves waitFor() against the host's LogStore", async () => {
    const store = new LogStore();
    const wk = makeFakeWorker(async (_body, host) => {
      // Schedule the matching push after the waitFor subscription is registered.
      setTimeout(() => {
        store.push({ level: 'info', tag: 'CHANGE', source: 'lifecycle', message: 'zone armed' });
      }, 10);
      const matched = await host.waitFor("(e) => e.tag === 'CHANGE'", 500);
      return { value: matched };
    });
    const { host, entries } = makeHost({ spawn: () => wk.worker, store });
    try {
      await host.run('await waitFor(e => e.tag === "CHANGE")');
      const resultRow = entries.find((e) => e.kind === 'result');
      assert.ok(resultRow, 'expected a result row');
      assert.match(resultRow.text, /zone armed/);
      assert.match(resultRow.text, /CHANGE/);
    } finally {
      host.dispose();
      wk.cleanup();
    }
  });

  it('stop() calls terminate on the underlying worker', async () => {
    const wk = makeFakeWorker(async () => ({ value: 1 }));
    const { host } = makeHost({ spawn: () => wk.worker });
    try {
      await host.run('1');
      assert.equal(wk.terminated(), false);
      host.stop();
      assert.equal(wk.terminated(), true);
    } finally {
      host.dispose();
      wk.cleanup();
    }
  });
});
