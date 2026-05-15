import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionStatus } from '../runtime/session-store.js';
import { buildMessageListItems, formatLogClock } from '../../core/log-view.js';
import { prettyLines, redactSecrets, safeJson } from '../../core/utils.js';
import { decodePayload } from '../../core/protocol-dict.js';
import type { LogEntry, OutputFormat } from '../../core/types.js';
import { Card, CardContent } from '@/components/ui/card';
import { LogDetailHeader, type ViewMode } from './LogDetailHeader.js';
import { LogDetailBody } from './LogDetailBody.js';

interface LogDetailPaneProps {
  entries: LogEntry[];
  selectedId?: string;
  outputFormat: OutputFormat;
  onFormatChange?: (fmt: OutputFormat) => void;
  /** When true, render content regardless of live connection (e.g. read-only replay). */
  forceConnected?: boolean;
}

export function LogDetailPane({ entries, selectedId, outputFormat, onFormatChange, forceConnected = false }: LogDetailPaneProps) {
  const { t } = useTranslation();
  const { connected: liveConnected } = useConnectionStatus();
  const connected = forceConnected || liveConnected;
  const [wrapLines, setWrapLines] = useState(true);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('decoded');

  const items = useMemo(() => buildMessageListItems(entries), [entries]);
  const selected = items.find((item) => item.id === selectedId);
  const hasContent = connected && selected !== undefined;

  const mergedFrames = selected?.merged ?? [];
  const frameCount = mergedFrames.length;
  const [frameIdx, setFrameIdx] = useState<number>(0);
  useEffect(() => {
    setFrameIdx(Math.max(0, frameCount - 1));
  }, [selectedId, frameCount]);
  const activeFrame = frameCount > 0 ? mergedFrames[Math.min(frameIdx, frameCount - 1)] : undefined;
  const activePayload = activeFrame?.payload ?? selected?.payload;
  const activeContent = activeFrame?.content ?? selected?.content ?? '';
  const activeTs = activeFrame?.ts ?? selected?.ts ?? '';

  const decoded = useMemo(() => {
    if (!selected) return undefined;
    return decodePayload(activePayload);
  }, [selected, activePayload]);

  const ackDecoded = useMemo(() => {
    if (!selected?.ack?.payload) return undefined;
    return decodePayload(selected.ack.payload);
  }, [selected]);

  const wireDecoded = useMemo(() => {
    if (!selected?.wireFrame || selected.wireFrame.payload === undefined) return undefined;
    return decodePayload(selected.wireFrame.payload);
  }, [selected]);

  const canDecode = decoded !== undefined && !decoded.unknown;

  const effectiveMode: ViewMode = useMemo(() => {
    if (viewMode === 'decoded' && !canDecode) return outputFormat;
    if (viewMode === 'pretty' || viewMode === 'json') return viewMode;
    return canDecode ? 'decoded' : outputFormat;
  }, [viewMode, canDecode, outputFormat]);

  const rendered = useMemo(() => {
    if (!selected) return '';
    if (activePayload !== undefined) {
      const formatted = effectiveMode === 'json'
        ? safeJson(activePayload)
        : prettyLines(activePayload, 0).join('\n');
      return redactSecrets(formatted);
    }
    try {
      const parsed = JSON.parse(activeContent) as unknown;
      if (effectiveMode === 'json') return safeJson(parsed);
      return prettyLines(parsed, 0).join('\n');
    } catch {
      return activeContent;
    }
  }, [selected, activePayload, activeContent, effectiveMode]);

  const ackRendered = useMemo(() => {
    const ackPayload = selected?.ack?.payload;
    if (ackPayload === undefined || ackPayload === null) return '';
    const formatted = effectiveMode === 'json'
      ? safeJson(ackPayload)
      : prettyLines(ackPayload, 0).join('\n');
    return redactSecrets(formatted);
  }, [selected, effectiveMode]);

  const wireRendered = useMemo(() => {
    const wire = selected?.wireFrame;
    if (!wire) return '';
    const wirePayload = wire.payload;
    if (wirePayload !== undefined && wirePayload !== null) {
      const formatted = effectiveMode === 'json'
        ? safeJson(wirePayload)
        : prettyLines(wirePayload, 0).join('\n');
      return redactSecrets(formatted);
    }
    return wire.content;
  }, [selected, effectiveMode]);

  const lineCount = rendered ? rendered.split('\n').length : 0;

  useEffect(() => {
    if (frameCount <= 1) return;
    const handler = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setFrameIdx((i) => Math.max(0, i - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setFrameIdx((i) => Math.min(frameCount - 1, i + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [frameCount]);

  function onCopy() {
    void navigator.clipboard.writeText(rendered).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      <LogDetailHeader
        selected={selected}
        activeTs={activeTs}
        lineCount={lineCount}
        frameIdx={frameIdx}
        setFrameIdx={setFrameIdx}
        frameCount={frameCount}
        viewMode={viewMode}
        setViewMode={setViewMode}
        effectiveMode={effectiveMode}
        canDecode={canDecode}
        hasContent={hasContent}
        wrapLines={wrapLines}
        setWrapLines={setWrapLines}
        onFormatChange={onFormatChange}
        rendered={rendered}
        copied={copied}
        onCopy={onCopy}
      />
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
        <span className="sr-only" aria-live="polite">
          {selected
            ? t('detail.selectedSrFull', {
                tag: selected.tag,
                time: formatLogClock(selected.ts),
                suffix: selected.ack
                  ? t('detail.selectedSrSuffixAck')
                  : selected.wireFrame
                    ? t('detail.selectedSrSuffixWire')
                    : t('detail.selectedSrSuffixNone'),
              })
            : t('detail.selectedSrEmpty')}
        </span>
        <LogDetailBody
          selected={selected}
          selectedId={selectedId}
          effectiveMode={effectiveMode}
          decoded={decoded}
          ackDecoded={ackDecoded}
          wireDecoded={wireDecoded}
          rendered={rendered}
          ackRendered={ackRendered}
          wireRendered={wireRendered}
          activeTs={activeTs}
          wrapLines={wrapLines}
          connected={connected}
        />
      </CardContent>
    </Card>
  );
}
