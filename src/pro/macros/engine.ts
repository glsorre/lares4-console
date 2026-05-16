// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { DEFAULT_STEP_DELAY_MS, type Macro, type MacroStep } from './types.js';

export type MacroSubmitFn = (line: string) => Promise<void> | void;
export type MacroMode = 'stopped' | 'playing' | 'paused';

export class MacroEngine {
  private steps: MacroStep[] = [];
  private index = 0;
  private speed = 1;
  private mode: MacroMode = 'stopped';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private activeName: string | undefined;
  private activeId: string | undefined;

  constructor(
    private readonly submit: MacroSubmitFn,
    private readonly onChange: () => void,
    private readonly onError: (err: Error, stepIndex: number) => void,
  ) {}

  get status(): MacroMode { return this.mode; }
  get position(): number { return this.index; }
  get total(): number { return this.steps.length; }
  get name(): string | undefined { return this.activeName; }
  get id(): string | undefined { return this.activeId; }
  get playbackSpeed(): number { return this.speed; }

  load(macro: Macro): void {
    this.stop();
    this.steps = macro.steps;
    this.activeName = macro.name;
    this.activeId = macro.id;
    this.index = 0;
    this.mode = 'paused';
    this.onChange();
  }

  setSpeed(next: number): void {
    if (!Number.isFinite(next) || next <= 0) {
      throw new Error('Macro speed must be > 0.');
    }
    this.speed = next;
    this.onChange();
  }

  play(): void {
    if (this.steps.length === 0) throw new Error('No macro loaded.');
    if (this.mode === 'playing') return;
    this.mode = 'playing';
    this.onChange();
    this.scheduleNext(this.delayFor(this.steps[this.index]));
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.clearTimer();
    this.onChange();
  }

  stop(): void {
    this.clearTimer();
    this.mode = 'stopped';
    this.index = 0;
    this.activeName = undefined;
    this.activeId = undefined;
    this.steps = [];
    this.onChange();
  }

  step(): void {
    if (this.steps.length === 0) throw new Error('No macro loaded.');
    if (this.index >= this.steps.length) {
      this.mode = 'paused';
      this.onChange();
      return;
    }
    void this.runStep();
  }

  private delayFor(step: MacroStep | undefined): number {
    const base = step?.delayMs ?? DEFAULT_STEP_DELAY_MS;
    return Math.max(0, Math.floor(base / this.speed));
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async runStep(): Promise<void> {
    const step = this.steps[this.index];
    if (!step) return;
    const stepIndex = this.index;
    try {
      await this.submit(step.command);
    } catch (err) {
      this.mode = 'paused';
      this.clearTimer();
      this.onChange();
      this.onError(err instanceof Error ? err : new Error(String(err)), stepIndex);
      return;
    }
    this.index += 1;
    if (this.index >= this.steps.length) {
      this.mode = 'paused';
      this.clearTimer();
      this.onChange();
      return;
    }
    if (this.mode === 'playing') {
      this.scheduleNext(this.delayFor(this.steps[this.index]));
    } else {
      this.onChange();
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.mode !== 'playing') return;
    this.clearTimer();
    this.timer = setTimeout(() => { void this.runStep(); }, delayMs);
  }
}
