import { useMemo } from 'react';
import { buildMessageListItems } from '../../core/log-view.js';
import type { LogEntry } from '../../core/types.js';

interface LogsListPaneProps {
  entries: LogEntry[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function LogsListPane({ entries, selectedId, onSelect }: LogsListPaneProps) {
  const items = useMemo(() => buildMessageListItems(entries), [entries]);

  return (
    <section className="pane logs-pane">
      <div className="pane-header">
        <strong>Logs</strong>
        <span>{items.length} messages</span>
      </div>
      <div
        className="logs-list"
        role="listbox"
        tabIndex={0}
        onKeyDown={(event) => {
          if (items.length === 0) return;
          const index = Math.max(0, items.findIndex((item) => item.id === selectedId));
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            const next = items[Math.max(0, index - 1)];
            if (next) onSelect(next.id);
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = items[Math.min(items.length - 1, index + 1)];
            if (next) onSelect(next.id);
          }
          if (event.key === 'Home') {
            event.preventDefault();
            const next = items[0];
            if (next) onSelect(next.id);
          }
          if (event.key === 'End') {
            event.preventDefault();
            const next = items[items.length - 1];
            if (next) onSelect(next.id);
          }
        }}
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              className={`log-row ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="tag">[{item.tag}]</span>
              <span className="ts">{new Date(item.ts).toLocaleTimeString()}</span>
              <span className="preview">{item.preview}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
