import type { CommandContext } from '../../core/command-router.js';

export class ReadOnlyBlockedError extends Error {
  readonly attempted: string;
  constructor(attempted: string) {
    super(`Read-only mode — "${attempted}" was not sent.`);
    this.name = 'ReadOnlyBlockedError';
    this.attempted = attempted;
  }
}

type Lares = CommandContext['lares'];
type SocketSend = CommandContext['socketSend'];

export function createReadOnlyGuard(lares: Lares, _socketSend: SocketSend): {
  lares: Lares;
  socketSend: SocketSend;
} {
  void _socketSend;
  const blockedSend: SocketSend = (cmd) => {
    throw new ReadOnlyBlockedError(`raw send ${cmd}`);
  };
  const guardedLares = new Proxy(lares, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return () => {
        throw new ReadOnlyBlockedError(String(prop));
      };
    },
  }) as Lares;
  return { lares: guardedLares, socketSend: blockedSend };
}
