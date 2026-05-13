// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

export interface MacroStep {
  command: string;
  delayMs?: number;
}

export interface Macro {
  id: string;
  name: string;
  description?: string;
  steps: MacroStep[];
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_STEP_DELAY_MS = 200;
