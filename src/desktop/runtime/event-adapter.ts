import type { SocketEventEmitted } from '../../infra/socket-types.js';

export function toEventLabel(event: SocketEventEmitted): string {
  switch (event.type) {
    case 'open': return 'socket-open';
    case 'close': return 'socket-close';
    case 'error': return 'socket-error';
    case 'response': return 'response';
    case 'change': return 'change';
    case 'multi_types': return 'multi-types';
    case 'raw': return 'raw';
    default: return 'unknown';
  }
}
