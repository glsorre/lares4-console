// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { SessionController, type SessionSnapshot } from '@/desktop/runtime/session-controller.js';
import { DesktopProfilesRepository } from '@/desktop/runtime/profiles-repository-desktop.js';
import { isFeatureLicensed } from '@/desktop/runtime/commercial-license-prefs.js';
import { MAX_FREE_TABS, type Tab, type TabMeta, type TabsSnapshot } from './types.js';

function generateTabId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `tab-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface TabsControllerDeps {
  profiles?: DesktopProfilesRepository;
  isLicensed?: () => boolean;
}

interface InternalTab extends Tab {
  fallbackLabel: string;
}

export class TabsController {
  private tabs: InternalTab[] = [];
  private active = '';
  private nextOrdinal = 1;
  private readonly profiles: DesktopProfilesRepository;
  private readonly listeners = new Set<() => void>();
  private readonly perTabUnsubs = new Map<string, () => void>();
  private readonly isLicensed: () => boolean;

  constructor(deps: TabsControllerDeps = {}) {
    this.profiles = deps.profiles ?? new DesktopProfilesRepository();
    this.isLicensed = deps.isLicensed ?? (() => isFeatureLicensed('tabs'));
    const first = this.spawnTab();
    this.tabs = [first];
    this.active = first.id;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private spawnTab(): InternalTab {
    const ordinal = this.nextOrdinal++;
    const id = generateTabId();
    const controller = new SessionController({ profiles: this.profiles });
    const tab: InternalTab = {
      id,
      label: `Tab ${String(ordinal)}`,
      fallbackLabel: `Tab ${String(ordinal)}`,
      controller,
    };
    const unsub = controller.subscribe(() => this.emit());
    this.perTabUnsubs.set(id, unsub);
    return tab;
  }

  canAddTab(): boolean {
    return this.tabs.length < MAX_FREE_TABS || this.isLicensed();
  }

  addTab(): string | null {
    if (!this.canAddTab()) return null;
    const tab = this.spawnTab();
    this.tabs = [...this.tabs, tab];
    this.active = tab.id;
    this.emit();
    return tab.id;
  }

  closeTab(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const removed = this.tabs[idx];
    removed.controller.disconnect();
    this.perTabUnsubs.get(id)?.();
    this.perTabUnsubs.delete(id);

    const next = this.tabs.filter((t) => t.id !== id);
    if (next.length === 0) {
      const replacement = this.spawnTab();
      this.tabs = [replacement];
      this.active = replacement.id;
    } else {
      this.tabs = next;
      if (this.active === id) {
        const neighbour = next[Math.min(idx, next.length - 1)];
        this.active = neighbour.id;
      }
    }
    this.emit();
  }

  setActive(id: string): void {
    if (this.active === id) return;
    if (!this.tabs.some((t) => t.id === id)) return;
    this.active = id;
    this.emit();
  }

  activeController(): SessionController {
    const tab = this.tabs.find((t) => t.id === this.active);
    if (!tab) throw new Error('No active tab');
    return tab.controller;
  }

  snapshot(): TabsSnapshot {
    const metas: TabMeta[] = this.tabs.map((tab) => {
      const s = tab.controller.snapshot();
      return {
        id: tab.id,
        label: s.activeProfileName ?? tab.fallbackLabel,
        status: s.connectionStatus,
        activeProfileName: s.activeProfileName,
      };
    });
    const activeTab = this.tabs.find((t) => t.id === this.active) ?? this.tabs[0];
    const activeSnapshot: SessionSnapshot = activeTab.controller.snapshot();
    return {
      tabs: metas,
      activeId: activeTab.id,
      activeSnapshot,
    };
  }
}
