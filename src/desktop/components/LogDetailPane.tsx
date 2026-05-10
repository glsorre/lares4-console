import { useMemo, useState } from 'react';
import { buildMessageListItems } from '../../core/log-view.js';
import { safeJson } from '../../core/utils.js';
import type { LogEntry, OutputFormat } from '../../core/types.js';

interface LogDetailPaneProps {
  entries: LogEntry[];
  selectedId?: string;
  outputFormat: OutputFormat;
}

export function LogDetailPane({ entries, selectedId, outputFormat }: LogDetailPaneProps) {
  const [detailMode, setDetailMode] = useState<'follow' | OutputFormat>('follow');
  const items = useMemo(() => buildMessageListItems(entries), [entries]);
  const selected = items.find((item) => item.id === selectedId);
  const effectiveFormat = detailMode === 'follow' ? outputFormat : detailMode;
  const rendered = useMemo(() => {
    if (!selected) return '';
    if (effectiveFormat === 'pretty') return selected.content;
    try {
      return JSON.stringify(JSON.parse(selected.content), null, 2);
    } catch {
      return safeJson(selected.content);
    }
  }, [selected, effectiveFormat]);

  return (
    <section className="pane detail-pane">
      <div className="pane-header">
        <strong>Detail</strong>
        <div className="format-controls">
          <button type="button" className={detailMode === 'follow' ? 'active' : ''} onClick={() => setDetailMode('follow')}>follow</button>
          <button type="button" className={detailMode === 'pretty' ? 'active' : ''} onClick={() => setDetailMode('pretty')}>pretty</button>
          <button type="button" className={detailMode === 'json' ? 'active' : ''} onClick={() => setDetailMode('json')}>json</button>
        </div>
      </div>
      <pre className="detail-content">{rendered || 'Select a message from logs list.'}</pre>
    </section>
  );
}
