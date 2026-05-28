// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

/** A single row rendered in the REPL scrollback. `input` is the user-typed code; `result` is
 *  the eval's return value already formatted for display; `error` carries the user-frame stack
 *  slice; `print` is a `print(...)` call routed back from the worker. */
export interface ReplEntry {
  id: string;
  ts: string;
  kind: 'input' | 'result' | 'error' | 'print';
  text: string;
}

export interface Snippet {
  id: number;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface SnippetsAdapter {
  list(): Promise<Snippet[]>;
  upsertByName(name: string, body: string): Promise<Snippet>;
  rename(id: number, name: string): Promise<void>;
  remove(id: number): Promise<void>;
}
