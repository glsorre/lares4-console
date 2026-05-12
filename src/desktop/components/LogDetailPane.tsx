import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, FileSearch, WrapText } from 'lucide-react';
import { buildMessageListItems, formatLogClock } from '../../core/log-view.js';
import { prettyLines, redactSecrets, safeJson } from '../../core/utils.js';
import type { LogEntry, OutputFormat } from '../../core/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { getTagClasses } from '../runtime/log-tag-classes.js';

interface LogDetailPaneProps {
  entries: LogEntry[];
  selectedId?: string;
  outputFormat: OutputFormat;
  onFormatChange?: (fmt: OutputFormat) => void;
}

export function LogDetailPane({ entries, selectedId, outputFormat, onFormatChange }: LogDetailPaneProps) {
  const [wrapLines, setWrapLines] = useState(true);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLPreElement>(null);

  const items = useMemo(() => buildMessageListItems(entries), [entries]);
  const selected = items.find((item) => item.id === selectedId);

  const rendered = useMemo(() => {
    if (!selected) return '';
    if (selected.payload !== undefined) {
      const formatted = outputFormat === 'pretty'
        ? prettyLines(selected.payload, 0).join('\n')
        : safeJson(selected.payload);
      return redactSecrets(formatted);
    }
    try {
      const parsed = JSON.parse(selected.content) as unknown;
      if (outputFormat === 'pretty') return prettyLines(parsed, 0).join('\n');
      return safeJson(parsed);
    } catch {
      return selected.content;
    }
  }, [selected, outputFormat]);

  const lineCount = rendered ? rendered.split('\n').length : 0;

  useEffect(() => {
    contentRef.current?.parentElement?.scrollTo({ top: 0 });
  }, [selectedId]);

  function copyContent() {
    void navigator.clipboard.writeText(rendered).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      <div className="border-border/60 flex h-[46px] shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex min-w-0 items-center gap-x-2 overflow-hidden">
          <span className="text-sm font-medium shrink-0">Detail</span>
          {selected && (
            <div className="text-muted-foreground flex min-w-0 items-center gap-x-1.5 overflow-hidden text-xs">
              <span aria-hidden className="shrink-0 opacity-40">·</span>
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold uppercase', getTagClasses(selected.tag))}>
                {selected.tag}
              </span>
              <span aria-hidden className="shrink-0 opacity-40">·</span>
              <span className="font-mono tabular-nums shrink-0">{formatLogClock(selected.ts)}</span>
              <span aria-hidden className="shrink-0 opacity-40">·</span>
              <span className="font-mono text-[0.7rem] shrink-0">mode {outputFormat}</span>
              {lineCount > 1 && (
                <>
                  <span aria-hidden className="shrink-0 opacity-40">·</span>
                  <span className="font-mono tabular-nums text-[0.7rem] shrink-0">{lineCount} lines</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ToggleGroup
            type="single"
            spacing={0}
            variant="outline"
            size="sm"
            value={outputFormat}
            onValueChange={(value) => {
              if (value === 'pretty' || value === 'json') onFormatChange?.(value);
            }}
            className="bg-background/60 shadow-sm"
          >
            <ToggleGroupItem value="pretty" aria-label="Pretty print">
              pretty
            </ToggleGroupItem>
            <ToggleGroupItem value="json" aria-label="JSON">
              json
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-7 w-7 shrink-0 p-0 text-muted-foreground', wrapLines && 'text-foreground')}
            onClick={() => setWrapLines((v) => !v)}
            aria-label={wrapLines ? 'Disable word wrap' : 'Enable word wrap'}
            aria-pressed={wrapLines}
          >
            <WrapText className="size-3.5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
            disabled={!rendered}
            onClick={copyContent}
            aria-label="Copy content"
          >
            {copied ? <Check className="size-3.5 text-green-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          </Button>
        </div>
      </div>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
        <span className="sr-only" aria-live="polite">
          {selected ? `Selected ${selected.tag} log from ${formatLogClock(selected.ts)}.` : 'No log selected.'}
        </span>
        {rendered ? (
          <ScrollArea className="min-h-0 flex-1">
            <pre
              ref={contentRef}
              className={cn(
                'text-foreground m-0 px-4 pb-4 font-mono text-[13px] leading-relaxed',
                wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto',
              )}
            >
              {rendered}
            </pre>
          </ScrollArea>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="bg-muted/50 text-muted-foreground/50 flex size-9 items-center justify-center rounded-full">
              <FileSearch className="size-4" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-foreground/75 text-sm font-medium">Nothing selected</p>
              <p className="text-muted-foreground max-w-[14rem] text-xs leading-relaxed">
                Click a row in the log list to inspect its payload.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
