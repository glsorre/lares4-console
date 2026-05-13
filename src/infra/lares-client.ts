import { Lares4Factory } from 'lares4-ts';
import {
  createSocketEmitter,
  defaultLogger,
  extractSocketBridge,
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
}

export async function createLaresClient(env: ClientEnv, options: CreateLaresClientOptions = {}) {
  const emitter = createSocketEmitter();
  if (options.onSocketSend) emitter.onSend(options.onSocketSend);
  if (options.onSocketReceive) emitter.onReceive(options.onSocketReceive);

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
