import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FileSearch, WrapText } from 'lucide-react';
import { buildMessageListItems, formatLogClock } from '../../core/log-view.js';
import { prettyLines, redactSecrets, safeJson } from '../../core/utils.js';
import { decodePayload } from '../../core/protocol-dict.js';
import type { LogEntry, OutputFormat } from '../../core/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getTagClasses } from '../runtime/log-tag-classes.js';

type ViewMode = 'decoded' | 'pretty' | 'json';

interface LogDetailPaneProps {
  entries: LogEntry[];
  selectedId?: string;
  outputFormat: OutputFormat;
  onFormatChange?: (fmt: OutputFormat) => void;
}

export function LogDetailPane({ entries, selectedId, outputFormat, onFormatChange }: LogDetailPaneProps) {
  const [wrapLines, setWrapLines] = useState(true);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('decoded');
  const contentRef = useRef<HTMLPreElement>(null);

  const items = useMemo(() => buildMessageListItems(entries), [entries]);
  const selected = items.find((item) => item.id === selectedId);

  const decoded = useMemo(() => {
    if (!selected) return undefined;
    return decodePayload(selected.payload);
  }, [selected]);

  const canDecode = decoded !== undefined && !decoded.unknown;

  const effectiveMode: ViewMode = useMemo(() => {
    if (viewMode === 'decoded' && !canDecode) return outputFormat;
    if (viewMode === 'pretty' || viewMode === 'json') return viewMode;
    return canDecode ? 'decoded' : outputFormat;
  }, [viewMode, canDecode, outputFormat]);

  const rendered = useMemo(() => {
    if (!selected) return '';
    if (selected.payload !== undefined) {
      const formatted = effectiveMode === 'json'
        ? safeJson(selected.payload)
        : prettyLines(selected.payload, 0).join('\n');
      return redactSecrets(formatted);
    }
    try {
      const parsed = JSON.parse(selected.content) as unknown;
      if (effectiveMode === 'json') return safeJson(parsed);
      return prettyLines(parsed, 0).join('\n');
    } catch {
      return selected.content;
    }
  }, [selected, effectiveMode]);

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
      <div className="border-border/60 flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-x-1.5 overflow-hidden">
          {selected ? (
            <div className="text-muted-foreground flex min-w-0 items-center gap-x-1.5 overflow-hidden text-xs">
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold uppercase', getTagClasses(selected.tag))}>
                {selected.tag}
              </span>
              <span className="font-mono tabular-nums shrink-0">{formatLogClock(selected.ts)}</span>
              <span aria-hidden className="shrink-0 opacity-40">·</span>
              <span className="font-mono text-[0.7rem] shrink-0">view {effectiveMode}</span>
              {lineCount > 1 && (
                <>
                  <span aria-hidden className="shrink-0 opacity-40">·</span>
                  <span className="font-mono tabular-nums text-[0.7rem] shrink-0">{lineCount} lines</span>
                </>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">No selection</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ToggleGroup
            type="single"
            spacing={0}
            variant="outline"
            size="sm"
            value={effectiveMode}
            onValueChange={(value) => {
              if (value === 'decoded' || value === 'pretty' || value === 'json') {
                setViewMode(value as ViewMode);
                if (value === 'pretty' || value === 'json') onFormatChange?.(value);
              }
            }}
            className="bg-background/60 shadow-sm"
          >
            <ToggleGroupItem value="decoded" aria-label="Decoded" disabled={!canDecode} title={canDecode ? 'Structured Lares4 payload view' : 'No decoded view for this entry'}>
              decoded
            </ToggleGroupItem>
            <ToggleGroupItem value="pretty" aria-label="Pretty print">
              pretty
            </ToggleGroupItem>
            <ToggleGroupItem value="json" aria-label="JSON">
              json
            </ToggleGroupItem>
          </ToggleGroup>
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent>{wrapLines ? 'Disable wrap' : 'Enable wrap'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent>{copied ? 'Copied' : 'Copy entry'}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
        <span className="sr-only" aria-live="polite">
          {selected ? `Selected ${selected.tag} log from ${formatLogClock(selected.ts)}.` : 'No log selected.'}
        </span>
        {selected && effectiveMode === 'decoded' && decoded ? (
          <ScrollArea className="min-h-0 flex-1">
            <DecodedPanel decoded={decoded} />
          </ScrollArea>
        ) : rendered ? (
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

function formatFieldValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return safeJson(value);
}

function resultChipClass(detail: string | undefined): string {
  if (!detail) return 'bg-muted text-muted-foreground ring-border/50';
  const upper = detail.toUpperCase();
  if (upper === 'OK' || upper === '0X00' || upper === '0') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30';
  }
  if (upper.includes('TIMEOUT') || upper.includes('PENDING')) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30';
  }
  return 'bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/30';
}

const accentSectionClasses =
  'border-border/50 ring-1 ring-[oklch(var(--accent)/0.08)] relative overflow-hidden rounded-lg border bg-background/55 p-3 before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[oklch(var(--accent)/0.45)] before:to-transparent';

function FieldCard({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="border-border/40 bg-background/60 rounded-lg border p-3">
      <div className="text-muted-foreground text-[0.6rem] font-medium uppercase tracking-wider">{label}</div>
      <div className="text-foreground mt-1 font-mono text-base font-semibold leading-tight break-all">{value}</div>
      {description && <div className="text-muted-foreground mt-1 text-xs leading-snug">{description}</div>}
    </div>
  );
}

function DecodedPanel({ decoded }: { decoded: NonNullable<ReturnType<typeof decodePayload>> }) {
  const metaFields = decoded.topFields.filter((f) => f.key !== 'CMD' && f.key !== 'PAYLOAD_TYPE');

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-[13px]">
      {(decoded.cmd || decoded.payloadType) && (
        <section className={accentSectionClasses}>
          <div className="text-muted-foreground mb-2 font-mono text-[0.6rem] font-medium uppercase tracking-wider">Header</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {decoded.cmd && (
              <FieldCard label="CMD" value={decoded.cmd} description={decoded.cmdDescription} />
            )}
            {decoded.payloadType && (
              <FieldCard label="PAYLOAD_TYPE" value={decoded.payloadType} description={decoded.payloadTypeDescription} />
            )}
          </div>
          {metaFields.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {metaFields.map((f) => (
                <span
                  key={f.key}
                  className="border-border/40 bg-muted/40 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.65rem]"
                  title={f.description}
                >
                  <span className="text-muted-foreground">{f.key}</span>
                  <span className="text-foreground">{formatFieldValue(f.value)}</span>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {decoded.innerFields.length > 0 && (
        <section className={accentSectionClasses}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-muted-foreground font-mono text-[0.6rem] font-medium uppercase tracking-wider">Payload</div>
            {decoded.resultDetail && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[0.65rem] ring-1',
                  resultChipClass(decoded.resultDetail),
                )}
                title={decoded.resultDetailDescription}
              >
                RESULT
                <span className="font-semibold">{decoded.resultDetail}</span>
                {decoded.resultDetailDescription && (
                  <span className="opacity-80">· {decoded.resultDetailDescription}</span>
                )}
              </span>
            )}
          </div>
          <div className="flex flex-col">
            {decoded.innerFields.map((f, idx) => (
              <FieldRow
                key={`${f.key}-${idx}`}
                label={f.key}
                value={f.value}
                description={f.description}
                isLast={idx === decoded.innerFields.length - 1}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FieldRow({
  label,
  value,
  description,
  isLast,
}: {
  label: string;
  value: unknown;
  description?: string;
  isLast?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const display = formatFieldValue(value);
  const multiline = display.includes('\n') || display.length > 80;

  function copy() {
    void navigator.clipboard.writeText(display).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div
      className={cn(
        'group grid grid-cols-[7rem_1fr_auto] items-start gap-x-3 gap-y-1 py-1.5',
        !isLast && 'border-b border-border/30',
      )}
    >
      <div className="text-muted-foreground font-mono text-xs leading-relaxed" title={description}>{label}</div>
      <div className="min-w-0">
        {multiline ? (
          <div className="flex flex-col gap-1">
            <pre
              className={cn(
                'bg-muted/40 m-0 rounded p-2 font-mono text-[12px] leading-snug whitespace-pre-wrap break-words',
                !expanded && 'max-h-32 overflow-hidden',
              )}
            >
              {display}
            </pre>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start text-[0.7rem]"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        ) : (
          <span className="text-foreground font-mono break-words">{display}</span>
        )}
        {description && !multiline && (
          <span className="text-muted-foreground ml-2 text-xs">{description}</span>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copy}
            className={cn(
              'text-muted-foreground hover:text-foreground rounded p-1 transition-opacity',
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              copied && 'opacity-100',
            )}
            aria-label={`Copy ${label}`}
          >
            {copied ? <Check className="size-3 text-green-600" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied' : 'Copy value'}</TooltipContent>
      </Tooltip>
    </div>
  );
}
