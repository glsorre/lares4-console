/** Human-readable badge label for SessionSnapshot.connectionStatus */
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
