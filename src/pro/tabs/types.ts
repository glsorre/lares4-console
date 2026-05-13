// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import type { SessionController, SessionSnapshot } from '@/desktop/runtime/session-controller.js';

export const MAX_FREE_TABS = 1;

export interface Tab {
  id: string;
  label: string;
  controller: SessionController;
}

export interface TabMeta {
  id: string;
  label: string;
  status: SessionSnapshot['connectionStatus'];
  activeProfileName: string | undefined;
}

export interface TabsSnapshot {
  tabs: TabMeta[];
  activeId: string;
  activeSnapshot: SessionSnapshot;
}
