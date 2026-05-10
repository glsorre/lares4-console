import { useMemo } from 'react';
import type { SessionSnapshot } from '../runtime/session-controller.js';

interface CommandPaneProps {
  snapshot: SessionSnapshot;
  command: string;
  onCommandChange: (value: string) => void;
  onSubmit: () => void;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
}

export function CommandPane({
  snapshot,
  command,
  onCommandChange,
  onSubmit,
  onHistoryUp,
  onHistoryDown,
}: CommandPaneProps) {
  const statusLabel = useMemo(
    () => `conn:${snapshot.connectionStatus} replay:${snapshot.replayStatus} format:${snapshot.outputFormat}`,
    [snapshot.connectionStatus, snapshot.replayStatus, snapshot.outputFormat],
  );

  return (
    <section className="pane command-pane">
      <div className="pane-header">
        <strong>Command Bar</strong>
        <span>{statusLabel}</span>
      </div>
      <div className="command-row">
        <input
          className="command-input"
          value={command}
          onChange={(event) => onCommandChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSubmit();
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              onHistoryUp();
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              onHistoryDown();
            }
          }}
          placeholder="Type a command, e.g. state all"
        />
        <button type="button" onClick={onSubmit}>Run</button>
      </div>
      {snapshot.error ? <div className="error-line">{snapshot.error}</div> : null}
    </section>
  );
}
