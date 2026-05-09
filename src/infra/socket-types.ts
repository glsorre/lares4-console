export type SocketEventType = 'raw' | 'error' | 'response' | 'multi_types' | 'change' | 'open' | 'close';

export interface SocketEventEmitted {
  type: SocketEventType;
  message?: string | Record<string, unknown>;
}
