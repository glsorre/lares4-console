import { Lares4Factory } from 'lares4-ts';
import {
  createSocketEmitter,
  defaultLogger,
  extractSocketBridge,
  type SocketCloseListener,
  type SocketErrorListener,
} from './lares4-logger.js';

export interface ClientEnv {
  ip: string;
  pin: string;
  sender: string;
  wss: boolean;
}

export interface CreateLaresClientOptions {
  onSocketSend?: (raw: string) => void;
  onSocketReceive?: (raw: string) => void;
  onSocketError?: SocketErrorListener;
  onSocketClose?: SocketCloseListener;
}

export async function createLaresClient(env: ClientEnv, options: CreateLaresClientOptions = {}) {
  const emitter = createSocketEmitter();
  if (options.onSocketSend) emitter.onSend(options.onSocketSend);
  if (options.onSocketReceive) emitter.onReceive(options.onSocketReceive);
  if (options.onSocketError) emitter.onError(options.onSocketError);
  if (options.onSocketClose) emitter.onClose(options.onSocketClose);

  const lares = await Lares4Factory.createLares4(env.sender, env.ip, env.pin, env.wss, {
    logger: defaultLogger,
    wsFactory: emitter.factory,
  });

  const socket = extractSocketBridge(lares);
  if (!socket) {
    throw new Error('Socket bridge unavailable.');
  }

  return { lares, socket };
}
