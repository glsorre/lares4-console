import { Lares4Factory } from 'lares4-ts';
import type { GenericLogger, Lares4WsFactory } from 'lares4-ts';
import type { SocketEventEmitted } from './socket-types.js';

export interface ClientEnv {
  ip: string;
  pin: string;
  sender: string;
  wss: boolean;
}

export interface CreateLaresClientOptions {
  onSocketSend?: (raw: string) => void;
  onSocketReceive?: (raw: string) => void;
}

const consoleLogger: GenericLogger = {
  info: (msg) => console.info(msg),
  error: (msg) => console.error(msg),
  warn: (msg) => console.warn(msg),
  debug: (msg) => console.debug(msg),
};

function buildWsFactory(
  onSocketSend?: (raw: string) => void,
  onSocketReceive?: (raw: string) => void,
): Lares4WsFactory {
  return (url, protocols) => {
    const ws = new WebSocket(url, protocols);
    if (onSocketSend) {
      const origSend = ws.send.bind(ws);
      ws.send = ((data: Parameters<WebSocket['send']>[0]) => {
        if (typeof data === 'string') {
          try { onSocketSend(data); } catch { /* never break the send path */ }
        }
        origSend(data);
      }) as WebSocket['send'];
    }
    if (onSocketReceive) {
      ws.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          try { onSocketReceive(event.data); } catch { /* never break receive path */ }
        }
      });
    }
    return ws;
  };
}

export async function createLaresClient(env: ClientEnv, options: CreateLaresClientOptions = {}) {
  const lares = await Lares4Factory.createLares4(env.sender, env.ip, env.pin, env.wss, {
    logger: consoleLogger,
    wsFactory: buildWsFactory(options.onSocketSend, options.onSocketReceive),
  });
  const socket = (lares as unknown as {
    _ws?: {
      send: (cmd: string, payloadType: string, payload: Record<string, unknown>) => void;
      messages: { subscribe: (listener: (event: SocketEventEmitted) => void) => () => void };
    };
  })._ws;
  if (!socket) {
    throw new Error('Socket bridge unavailable.');
  }
  return { lares, socket };
}
