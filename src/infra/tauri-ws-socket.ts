import { Channel, invoke } from '@tauri-apps/api/core';

export interface TauriWsOpts {
  acceptInvalidCerts?: boolean;
  acceptInvalidHostnames?: boolean;
}

type Listener = (event: unknown) => void;

type WsEvent =
  | { type: 'message'; data: string }
  | { type: 'binary'; data: string }
  | { type: 'error'; message: string }
  | { type: 'close'; code: number; reason: string; wasClean: boolean };

interface ConnectResult {
  id: number;
  protocol: string | null;
}

function normalizeProtocols(input: string | string[] | undefined): string[] {
  if (input === undefined) return [];
  if (typeof input === 'string') return input.length > 0 ? [input] : [];
  return input.filter((s) => typeof s === 'string' && s.length > 0);
}

const READY = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/**
 * Browser-`WebSocket`-shaped wrapper that routes through the Tauri `ws_*` commands.
 * Used when a profile opts into accepting self-signed certificates — WebKit's native
 * `WebSocket` cannot bypass TLS validation.
 */
export class TauriWebSocket {
  readonly url: string;
  readyState: number = READY.CONNECTING;
  /** Subprotocol the server negotiated, or `''` if none — mirrors `WebSocket.protocol`. */
  protocol: string = '';

  private id: number | undefined;
  private readonly protocols: string[];
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly connectPromise: Promise<void>;
  private closeRequested = false;

  constructor(url: string, protocols?: string | string[], opts: TauriWsOpts = {}) {
    this.url = url;
    this.protocols = normalizeProtocols(protocols);
    this.connectPromise = this.bootstrap(url, opts);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (typeof data !== 'string') {
      this.dispatch('error', { type: 'error', message: 'TauriWebSocket only supports string payloads' });
      return;
    }
    if (this.readyState !== READY.OPEN || this.id === undefined) {
      this.dispatch('error', { type: 'error', message: 'TauriWebSocket send before open' });
      return;
    }
    const id = this.id;
    void invoke('ws_send', { id, payload: data }).catch((err: unknown) => {
      this.dispatch('error', {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === READY.CLOSED) return;
    this.closeRequested = true;
    if (this.readyState !== READY.CLOSING) this.readyState = READY.CLOSING;
    if (this.id !== undefined) {
      void invoke('ws_close', { id: this.id, code, reason }).catch(() => undefined);
    }
    // If still connecting, the bootstrap path will issue ws_close after the id resolves.
  }

  addEventListener(name: string, listener: Listener): void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(listener);
  }

  removeEventListener(name: string, listener: Listener): void {
    this.listeners.get(name)?.delete(listener);
  }

  private dispatch(name: string, event: Record<string, unknown>): void {
    const set = this.listeners.get(name);
    if (!set || set.size === 0) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors so one bad consumer cannot break the socket.
      }
    }
  }

  private handle(event: WsEvent): void {
    switch (event.type) {
      case 'message':
        this.dispatch('message', { type: 'message', data: event.data });
        return;
      case 'binary':
        // lares4 protocol is text-only — surface binary as a message frame for fidelity.
        this.dispatch('message', { type: 'message', data: event.data });
        return;
      case 'error':
        this.dispatch('error', { type: 'error', message: event.message });
        return;
      case 'close':
        this.readyState = READY.CLOSED;
        this.dispatch('close', {
          type: 'close',
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        return;
    }
  }

  private async bootstrap(url: string, opts: TauriWsOpts): Promise<void> {
    const channel = new Channel<WsEvent>();
    channel.onmessage = (event) => this.handle(event);

    try {
      const result = await invoke<ConnectResult>('ws_connect', {
        url,
        opts: {
          acceptInvalidCerts: opts.acceptInvalidCerts === true,
          acceptInvalidHostnames: opts.acceptInvalidHostnames === true,
        },
        protocols: this.protocols,
        onEvent: channel,
      });
      const { id } = result;
      this.id = id;
      this.protocol = result.protocol ?? '';
      this.readyState = READY.OPEN;
      // Dispatch async so listeners attached after construction still observe `open`.
      queueMicrotask(() => {
        if (this.readyState === READY.OPEN) this.dispatch('open', { type: 'open' });
      });
      if (this.closeRequested) {
        void invoke('ws_close', { id, code: 1000, reason: '' }).catch(() => undefined);
      }
    } catch (err) {
      this.readyState = READY.CLOSED;
      const message = err instanceof Error ? err.message : String(err);
      queueMicrotask(() => {
        this.dispatch('error', { type: 'error', message });
        this.dispatch('close', { type: 'close', code: 1006, reason: message, wasClean: false });
      });
    }
  }
}
