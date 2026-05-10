import type { LogEntry } from './types.js';

export interface ReplayEvent {
  atMs: number;
  entry: LogEntry;
}

/** Shared replay timer; works in Node and browser (Tauri webview). */
export class ReplayEngine {
  private events: ReplayEvent[] = [];
  private index = 0;
  private speed = 1;
  private mode: 'stopped' | 'playing' | 'paused' = 'stopped';
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onEmit: (entry: LogEntry) => void,
    private readonly onFinished: () => void,
  ) {}

  get status(): string {
    return this.mode;
  }

  get loadedEvents(): number {
    return this.events.length;
  }

  get position(): number {
    return this.index;
  }

  get playbackSpeed(): number {
    return this.speed;
  }

  load(events: ReplayEvent[]): void {
    this.stop();
    this.events = events;
    this.index = 0;
    this.mode = 'paused';
  }

  setSpeed(next: number): void {
    if (!Number.isFinite(next) || next <= 0) {
      throw new Error('Replay speed must be > 0.');
    }
    this.speed = next;
  }

  play(): void {
    if (this.events.length === 0) throw new Error('No replay loaded.');
    if (this.mode === 'playing') return;
    this.mode = 'playing';
    this.scheduleNext(0);
  }

  pause(): void {
    if (this.mode === 'stopped') return;
    this.mode = 'paused';
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.mode = 'stopped';
    this.index = 0;
  }

  step(): void {
    if (this.events.length === 0) throw new Error('No replay loaded.');
    if (this.index >= this.events.length) {
      this.mode = 'paused';
      return;
    }
    const event = this.events[this.index];
    if (!event) return;
    this.onEmit(event.entry);
    this.index += 1;
    this.mode = 'paused';
    if (this.index >= this.events.length) this.onFinished();
  }

  private scheduleNext(delayMs: number): void {
    if (this.mode !== 'playing') return;
    this.timer = setTimeout(() => {
      if (this.mode !== 'playing') return;
      const current = this.events[this.index];
      if (!current) {
        this.mode = 'paused';
        this.onFinished();
        return;
      }
      this.onEmit(current.entry);
      this.index += 1;
      const next = this.events[this.index];
      if (!next) {
        this.mode = 'paused';
        this.onFinished();
        return;
      }
      const dt = Math.max(0, next.atMs - current.atMs);
      const scaled = Math.floor(dt / this.speed);
      this.scheduleNext(scaled);
    }, delayMs);
  }
}
