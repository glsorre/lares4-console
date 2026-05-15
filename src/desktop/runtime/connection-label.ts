/** Human-readable badge label for SessionSnapshot.connectionStatus (English fallback). */
export function formatConnectionLabel(status: string): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'connecting':
      return 'Connecting';
    case 'online':
      return 'Online';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}

/** Translation key for a known connection status; null for unknown values. */
export function connectionLabelKey(status: string): string | null {
  switch (status) {
    case 'idle':
    case 'connecting':
    case 'online':
    case 'error':
      return `status.connection.${status}`;
    default:
      return null;
  }
}
