import type { GenericLogger, Lares4WsFactory } from 'lares4-ts';
import type { SocketEventEmitted } from './socket-types.js';

export const defaultLogger: GenericLogger = {
  info: (msg) => console.info(msg),
  error: (msg) => console.error(msg),
  warn: (msg) => console.warn(msg),
  debug: (msg) => console.debug(msg),
};

export type SocketSendListener = (raw: string) => void;
export type SocketReceiveListener = (raw: string) => void;

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

export function createSocketEmitter(): SocketEmitter {
  const sendListeners = new Set<SocketSendListener>();
  const receiveListeners = new Set<SocketReceiveListener>();
  const errorListeners = new Set<SocketErrorListener>();
  const closeListeners = new Set<SocketCloseListener>();

  const factory: Lares4WsFactory = (url, protocols) => {
    const ws = new WebSocket(url, protocols);

    const origSend = ws.send.bind(ws);
    ws.send = ((data: Parameters<WebSocket['send']>[0]) => {
      if (typeof data === 'string' && sendListeners.size > 0) {
        for (const listener of sendListeners) {
          try { listener(data); } catch { /* never break the send path */ }
        }
      }
      origSend(data);
    }) as WebSocket['send'];

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string' && receiveListeners.size > 0) {
        for (const listener of receiveListeners) {
          try { listener(event.data); } catch { /* never break receive path */ }
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
        try { listener(info); } catch { /* never break ws path */ }
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
        try { listener(info); } catch { /* never break ws path */ }
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
