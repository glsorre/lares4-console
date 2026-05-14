// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

export const MAX_FREE_WINDOWS = 1;

export interface WindowMeta {
  label: string;
  isMain: boolean;
}

export interface WindowsSnapshot {
  windows: WindowMeta[];
  currentLabel: string;
  canOpen: boolean;
}
