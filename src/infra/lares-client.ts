import { Lares4Factory } from 'lares4-ts';
import type { SocketEventEmitted } from './socket-types.js';

export interface ClientEnv {
  ip: string;
  pin: string;
  sender: string;
  wss: boolean;
}

export async function createLaresClient(env: ClientEnv) {
  const lares = await Lares4Factory.createLares4(env.sender, env.ip, env.pin, env.wss, {});
  // Accessing internal _ws bridge that lares4-ts does not expose publicly (lares4-ts file:../).
  // If this breaks at runtime, the library's internal naming convention has changed.
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
