import type { Lares4WsFactory } from 'lares4-ts';
import type { SocketEventEmitted } from './socket-types.js';
import { defaultLogger } from './lares-logger.js';
import { TauriWebSocket, type TauriWsOpts } from './tauri-ws-socket.js';

export interface SocketTlsOptions {
  /** Route the socket through the Tauri Rust bridge with a relaxed TLS verifier. */
  acceptInvalidCerts?: boolean;
}

/** Wire-layer frame event with the timestamp captured at the moment of send/receive. */
export interface SocketFrame {
  raw: string;
  /** Epoch ms captured at the wire boundary (more accurate than post-event-loop `Date.now()`). */
  ts: number;
}

export type SocketSendListener = (frame: SocketFrame) => void;
export type SocketReceiveListener = (frame: SocketFrame) => void;

export interface SocketErrorInfo {
  url: string;
  type: string;
  message?: string;
}

export interface SocketCloseInfo {
  url: string;
  code: number;
  reason: string;
  wasClean: boolean;
}

export type SocketErrorListener = (info: SocketErrorInfo) => void;
export type SocketCloseListener = (info: SocketCloseInfo) => void;

export interface SocketEmitter {
  factory: Lares4WsFactory;
  onSend: (listener: SocketSendListener) => () => void;
  onReceive: (listener: SocketReceiveListener) => () => void;
  onError: (listener: SocketErrorListener) => () => void;
  onClose: (listener: SocketCloseListener) => () => void;
}

export function createSocketEmitter(tls: SocketTlsOptions = {}): SocketEmitter {
  const sendListeners = new Set<SocketSendListener>();
  const receiveListeners = new Set<SocketReceiveListener>();
  const errorListeners = new Set<SocketErrorListener>();
  const closeListeners = new Set<SocketCloseListener>();
  const useTauriBridge = tls.acceptInvalidCerts === true;
  const tauriOpts: TauriWsOpts = { acceptInvalidCerts: tls.acceptInvalidCerts === true };

  const factory: Lares4WsFactory = (url, protocols) => {
    // WebKit cannot bypass TLS validation, so when a profile opts into accepting invalid
    // certs we route through the Tauri-side WS bridge (Rust tokio-tungstenite).
    const ws = (
      useTauriBridge
        ? (new TauriWebSocket(url, protocols, tauriOpts) as unknown as WebSocket)
        : new WebSocket(url, protocols)
    );

    const origSend = ws.send.bind(ws);
    ws.send = ((data: Parameters<WebSocket['send']>[0]) => {
      if (typeof data === 'string' && sendListeners.size > 0) {
        const frame: SocketFrame = { raw: data, ts: Date.now() };
        for (const listener of sendListeners) {
          try { listener(frame); } catch (err) {
            // Never break the send path — but surface the bug at the console.
            defaultLogger.warn(`socket send listener threw: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
      origSend(data);
    }) as WebSocket['send'];

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string' && receiveListeners.size > 0) {
        const frame: SocketFrame = { raw: event.data, ts: Date.now() };
        for (const listener of receiveListeners) {
          try { listener(frame); } catch (err) {
            defaultLogger.warn(`socket receive listener threw: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    });

    ws.addEventListener('error', (event) => {
      if (errorListeners.size === 0) return;
      const info: SocketErrorInfo = {
        url,
        type: event.type,
        message: (event as ErrorEvent).message || undefined,
      };
      for (const listener of errorListeners) {
        try { listener(info); } catch (err) {
          defaultLogger.warn(`socket error listener threw: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });

    ws.addEventListener('close', (event) => {
      if (closeListeners.size === 0) return;
      const info: SocketCloseInfo = {
        url,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      };
      for (const listener of closeListeners) {
        try { listener(info); } catch (err) {
          defaultLogger.warn(`socket close listener threw: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });

    return ws;
  };

  return {
    factory,
    onSend: (listener) => {
      sendListeners.add(listener);
      return () => sendListeners.delete(listener);
    },
    onReceive: (listener) => {
      receiveListeners.add(listener);
      return () => receiveListeners.delete(listener);
    },
    onError: (listener) => {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    onClose: (listener) => {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
  };
}

export interface SocketBridge {
  send: (cmd: string, payloadType: string, payload: Record<string, unknown>) => void;
  messages: {
    subscribe: (listener: (event: SocketEventEmitted) => void) => () => void;
  };
}

interface LaresInternal {
  _ws?: SocketBridge;
}

export function extractSocketBridge(lares: unknown): SocketBridge | undefined {
  return (lares as LaresInternal)._ws;
}
