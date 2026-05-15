// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { isFeatureLicensed, subscribeLicenseChange } from '@/desktop/runtime/commercial-license-prefs.js';
import { MAX_FREE_WINDOWS, type WindowsSnapshot } from './types.js';

export interface WindowsAdapter {
  currentLabel: () => string;
  list: () => Promise<string[]>;
  open: (label: string, route: string) => Promise<void>;
  onWindowOpened: (cb: (label: string) => void) => () => void;
  onWindowClosed: (cb: (label: string) => void) => () => void;
}

export interface WindowsControllerDeps {
  adapter: WindowsAdapter;
  isLicensed?: () => boolean;
  now?: () => number;
}

const MAIN_LABEL = 'main';

export class WindowsController {
  private labels: string[] = [];
  private readonly currentLabel: string;
  private readonly adapter: WindowsAdapter;
  private readonly isLicensed: () => boolean;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private readonly unsubAdapter: (() => void)[] = [];

  constructor(deps: WindowsControllerDeps) {
    this.adapter = deps.adapter;
    this.isLicensed = deps.isLicensed ?? (() => isFeatureLicensed('multiwindow'));
    this.now = deps.now ?? (() => Date.now());
    this.currentLabel = deps.adapter.currentLabel();
    this.unsubAdapter.push(
      deps.adapter.onWindowOpened((label) => this.handleOpened(label)),
      deps.adapter.onWindowClosed((label) => this.handleClosed(label)),
      subscribeLicenseChange(() => this.emit()),
    );
    void this.refresh();
  }

  dispose(): void {
    for (const u of this.unsubAdapter) u();
    this.unsubAdapter.length = 0;
    this.listeners.clear();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private async refresh(): Promise<void> {
    const next = await this.adapter.list();
    this.labels = next;
    this.emit();
  }

  private handleOpened(label: string): void {
    if (!this.labels.includes(label)) {
      this.labels = [...this.labels, label];
      this.emit();
    }
  }

  private handleClosed(label: string): void {
    const next = this.labels.filter((l) => l !== label);
    if (next.length === this.labels.length) return;
    this.labels = next;
    this.emit();
  }

  canOpen(): boolean {
    if (this.isLicensed()) return true;
    return this.labels.length < MAX_FREE_WINDOWS + 1;
  }

  async openWindow(route: string): Promise<string | null> {
    if (!this.canOpen()) return null;
    const label = `console-${String(this.now())}`;
    await this.adapter.open(label, route);
    // Adapter event will sync state; optimistically include in case the event
    // hasn't landed yet.
    if (!this.labels.includes(label)) {
      this.labels = [...this.labels, label];
      this.emit();
    }
    return label;
  }

  snapshot(): WindowsSnapshot {
    return {
      windows: this.labels.map((label) => ({ label, isMain: label === MAIN_LABEL })),
      currentLabel: this.currentLabel,
      canOpen: this.canOpen(),
    };
  }
}
