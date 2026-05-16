import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, ChevronDown, ChevronRight, Copy, FileSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PaneEmpty } from './PaneEmpty.js';
import { formatLogClock, type buildMessageListItems } from '../../core/log-view.js';
import { safeJson } from '../../core/utils.js';
import type { decodePayload } from '../../core/protocol-dict.js';
import type { LogEntry } from '../../core/types.js';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LogTagChip } from './LogTagChip.js';
import { RowChip } from './RowChip.js';
import { ackResultChipClasses } from '../runtime/status-chips.js';
import { highlightJson, highlightPretty } from './syntax-highlight.js';
import { usePaneWidth } from '../hooks/use-pane-width.js';
import type { ViewMode } from './LogDetailHeader.js';

/** Pixel width at which the TX/ACK pair view switches from stacked to side-by-side. */
const PAIR_WIDE_THRESHOLD_PX = 640;

/** Trim a correlation id to a compact 4-char tail for display in the pair header. */
function formatCorrelationKey(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  if (trimmed.length <= 6) return trimmed;
  return trimmed.slice(-4);
}

type DecodedPayload = NonNullable<ReturnType<typeof decodePayload>>;

interface LogDetailBodyProps {
  selected: ReturnType<typeof buildMessageListItems>[number] | undefined;
  selectedId: string | undefined;
  effectiveMode: ViewMode;
  decoded: DecodedPayload | undefined;
  ackDecoded: DecodedPayload | undefined;
  wireDecoded: DecodedPayload | undefined;
  rendered: string;
  ackRendered: string;
  wireRendered: string;
  activeTs: string;
  wrapLines: boolean;
  connected: boolean;
}

export function LogDetailBody({
  selected,
  selectedId,
  effectiveMode,
  decoded,
  ackDecoded,
  wireDecoded,
  rendered,
  ackRendered,
  wireRendered,
  activeTs,
  wrapLines,
  connected,
}: LogDetailBodyProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLPreElement>(null);
  const { ref: paneRef, width: paneWidth } = usePaneWidth<HTMLDivElement>();
  const reduceMotion = useReducedMotion();
  const fade = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
      };

  useEffect(() => {
    contentRef.current?.parentElement?.scrollTo({ top: 0 });
  }, [selectedId]);

  return (
    <div ref={paneRef} className="flex min-h-0 flex-1 flex-col">
      <AnimatePresence mode="wait" initial={false}>
        {selected && selected.ack && (effectiveMode === 'decoded' ? decoded : rendered) ? (
          <motion.div key={`pair-${effectiveMode}-${selectedId ?? 'none'}`} {...fade} className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <PairHeader
                correlationId={selected.correlationId}
                latencyMs={selected.ack.latencyMs}
                requestTs={activeTs}
                responseTs={selected.ack.ts}
              />
              <div
                className={cn(
                  'px-4 pb-4 pt-1',
                  paneWidth >= PAIR_WIDE_THRESHOLD_PX
                    ? 'grid grid-cols-2 items-start gap-3'
                    : 'flex flex-col gap-3',
                )}
              >
                <PairCard
                  selected
                  tag={selected.tag}
                  ts={activeTs}
                  role={t('detail.roleRequest')}
                >
                  <PairBody
                    decoded={effectiveMode === 'decoded' && decoded ? decoded : undefined}
                    rendered={effectiveMode === 'decoded' && decoded ? undefined : rendered}
                    mode={effectiveMode}
                    wrapLines={wrapLines}
                    contentRef={effectiveMode === 'decoded' && decoded ? undefined : contentRef}
                  />
                </PairCard>
                <PairCard
                  tag="ACK"
                  ts={selected.ack.ts}
                  role={t('detail.roleResponse')}
                  resultChip={
                    <RowChip className={ackResultChipClasses(selected.ack.result)}>
                      <span className="font-semibold">{selected.ack.result ?? t('detail.ackLabel')}</span>
                    </RowChip>
                  }
                >
                  <PairBody
                    decoded={effectiveMode === 'decoded' && ackDecoded && !ackDecoded.unknown ? ackDecoded : undefined}
                    rendered={effectiveMode === 'decoded' && ackDecoded && !ackDecoded.unknown ? undefined : ackRendered}
                    mode={effectiveMode}
                    wrapLines={wrapLines}
                    fallback={t('detail.noPayload')}
                  />
                </PairCard>
              </div>
            </ScrollArea>
          </motion.div>
        ) : selected && selected.wireFrame && (effectiveMode === 'decoded' ? decoded : rendered) ? (
          <motion.div key={`wire-${effectiveMode}-${selectedId ?? 'none'}`} {...fade} className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <PairHeader
                kind="wire-decoded"
                requestTs={selected.wireFrame.ts}
                responseTs={activeTs}
              />
              <div
                className={cn(
                  'px-4 pb-4 pt-1',
                  paneWidth >= PAIR_WIDE_THRESHOLD_PX
                    ? 'grid grid-cols-2 items-start gap-3'
                    : 'flex flex-col gap-3',
                )}
              >
                <PairCard
                  tag="RAW_RX"
                  ts={selected.wireFrame.ts}
                  role={t('detail.roleWire')}
                >
                  <PairBody
                    decoded={effectiveMode === 'decoded' && wireDecoded && !wireDecoded.unknown ? wireDecoded : undefined}
                    rendered={effectiveMode === 'decoded' && wireDecoded && !wireDecoded.unknown ? undefined : wireRendered}
                    mode={effectiveMode}
                    wrapLines={wrapLines}
                    fallback={t('detail.noWirePayload')}
                  />
                </PairCard>
                <PairCard
                  selected
                  tag={selected.tag}
                  ts={activeTs}
                  role={t('detail.roleDecoded')}
                >
                  <PairBody
                    decoded={effectiveMode === 'decoded' && decoded ? decoded : undefined}
                    rendered={effectiveMode === 'decoded' && decoded ? undefined : rendered}
                    mode={effectiveMode}
                    wrapLines={wrapLines}
                    contentRef={effectiveMode === 'decoded' && decoded ? undefined : contentRef}
                  />
                </PairCard>
              </div>
            </ScrollArea>
          </motion.div>
        ) : selected && effectiveMode === 'decoded' && decoded ? (
          <motion.div key={`decoded-${selectedId ?? 'none'}`} {...fade} className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <DecodedPanel decoded={decoded} />
            </ScrollArea>
          </motion.div>
        ) : rendered ? (
          <motion.div key={`text-${effectiveMode}-${selectedId ?? 'none'}`} {...fade} className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <pre
                ref={contentRef}
                className={cn(
                  'text-foreground m-0 px-4 pb-4 font-mono text-[0.75rem] leading-snug',
                  wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto',
                )}
              >
                {effectiveMode === 'json' ? highlightJson(rendered) : highlightPretty(rendered)}
              </pre>
            </ScrollArea>
          </motion.div>
        ) : (
          <motion.div key="empty" {...fade} className="flex flex-1 flex-col">
            <PaneEmpty
              icon={FileSearch}
              title={connected ? t('detail.emptyTitleConnected') : t('detail.emptyTitleDisconnected')}
              description={
                connected
                  ? t('detail.emptyDescConnected')
                  : t('detail.emptyDescDisconnected')
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatFieldValue(value: unknown, t: (k: string) => string): string {
  if (value === undefined) return t('detail.fieldDashValue');
  if (value === null) return t('detail.fieldNullValue');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return safeJson(value);
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

function DecodedPanel({ decoded }: { decoded: DecodedPayload }) {
  const { t } = useTranslation();
  const metaFields = decoded.topFields.filter((f) => f.key !== 'CMD' && f.key !== 'PAYLOAD_TYPE');

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-[13px]">
      {(decoded.cmd || decoded.payloadType) && (
        <section className={accentSectionClasses}>
          <div className="text-muted-foreground mb-2 font-mono text-xs font-medium uppercase tracking-wider">{t('detail.fieldHeaderHeader')}</div>
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
                  className="border-border/40 bg-muted/40 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs"
                  title={f.description}
                >
                  <span className="text-muted-foreground">{f.key}</span>
                  <span className="text-foreground">{formatFieldValue(f.value, t)}</span>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {decoded.innerFields.length > 0 && (
        <section className={accentSectionClasses}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-muted-foreground font-mono text-xs font-medium uppercase tracking-wider">{t('detail.fieldHeaderPayload')}</div>
            {decoded.resultDetail && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs',
                  ackResultChipClasses(decoded.resultDetail),
                )}
                title={decoded.resultDetailDescription}
              >
                {t('detail.fieldResultLabel')}
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
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const display = formatFieldValue(value, t);
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
        'group grid grid-cols-[max-content_1fr_auto] items-start gap-x-4 gap-y-1 py-1.5',
        !isLast && 'border-b border-border/30',
      )}
    >
      <div className="text-muted-foreground font-mono text-meta uppercase tracking-wider leading-[1.6]" title={description}>{label}</div>
      <div className="min-w-0">
        {multiline ? (
          <div className="flex flex-col gap-1">
            <pre
              className={cn(
                'bg-muted/40 m-0 rounded p-2 font-mono text-[13px] leading-snug whitespace-pre-wrap break-words',
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
              {expanded ? t('detail.fieldCollapse') : t('detail.fieldExpand')}
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
            aria-label={t('detail.fieldCopyAria', { label })}
          >
            {copied ? <Check className="size-3 text-green-600" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{copied ? t('detail.fieldCopiedTooltip') : t('detail.fieldCopyTooltip')}</TooltipContent>
      </Tooltip>
    </div>
  );
}

type PairKind = 'request-response' | 'wire-decoded';

function PairHeader({
  kind = 'request-response',
  correlationId,
  latencyMs,
  requestTs,
  responseTs,
}: {
  kind?: PairKind;
  correlationId?: string;
  latencyMs?: number;
  requestTs?: string;
  responseTs?: string;
}) {
  const { t } = useTranslation();
  const key = formatCorrelationKey(correlationId);
  const isWire = kind === 'wire-decoded';
  return (
    <div
      className="mx-4 mt-1 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/40 bg-muted/30 px-2.5 py-1.5"
      aria-label={isWire ? t('detail.pairAriaWireDecoded') : t('detail.pairAriaRequestResponse')}
    >
      <span className="text-muted-foreground font-mono text-meta uppercase tracking-wider">
        {isWire ? t('detail.wireDecodedLabel') : t('detail.pairLabel')}
      </span>
      {!isWire && key && (
        <span
          className="inline-flex items-center gap-1 rounded border border-border/50 bg-background/70 px-1.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-wide tabular-nums"
          title={correlationId}
        >
          <span className="text-muted-foreground">{t('detail.seqLabel')}</span>
          <span className="font-semibold">{key}</span>
        </span>
      )}
      {requestTs && (
        <span className="font-mono text-meta tabular-nums text-muted-foreground" title={isWire ? t('detail.wireTsTitle') : t('detail.requestTsTitle')}>
          {formatLogClock(requestTs)}
        </span>
      )}
      <ArrowRight className="size-3 shrink-0 text-muted-foreground/70" aria-hidden />
      {responseTs && (
        <span className="font-mono text-meta tabular-nums text-muted-foreground" title={isWire ? t('detail.decodedTsTitle') : t('detail.responseTsTitle')}>
          {formatLogClock(responseTs)}
        </span>
      )}
      {!isWire && latencyMs !== undefined && (
        <span className="inline-flex items-center gap-1 rounded border border-border/50 bg-background/70 px-1.5 py-0.5 font-mono text-[0.7rem] tabular-nums">
          <span className="text-muted-foreground">{t('detail.deltaLabel')}</span>
          <span className="font-semibold">{t('detail.deltaMs', { n: latencyMs })}</span>
        </span>
      )}
    </div>
  );
}

function PairCard({
  selected,
  tag,
  ts,
  role,
  resultChip,
  children,
}: {
  selected?: boolean;
  tag: LogEntry['tag'];
  ts?: string;
  role: string;
  resultChip?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border border-border/50 bg-background/55',
        selected && 'ring-1 ring-[oklch(var(--primary)/0.35)] shadow-[inset_2px_0_0_0_var(--primary)]',
      )}
      aria-label={t('detail.cardRoleTag', { role, tag })}
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5">
        <span className="text-muted-foreground font-mono text-meta uppercase tracking-wider">{role}</span>
        <LogTagChip tag={tag} />
        {ts && (
          <span className="font-mono text-meta tabular-nums text-muted-foreground">{formatLogClock(ts)}</span>
        )}
        {resultChip && <span className="ml-auto">{resultChip}</span>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function PairBody({
  decoded,
  rendered,
  mode,
  wrapLines,
  contentRef,
  fallback,
}: {
  decoded?: DecodedPayload;
  rendered?: string;
  mode: ViewMode;
  wrapLines: boolean;
  contentRef?: React.RefObject<HTMLPreElement | null>;
  fallback?: string;
}) {
  if (decoded) return <DecodedPanel decoded={decoded} />;
  if (rendered) {
    return (
      <pre
        ref={contentRef}
        className={cn(
          'text-foreground m-0 px-3 py-2 font-mono text-[0.75rem] leading-snug',
          wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto',
        )}
      >
        {mode === 'json' ? highlightJson(rendered) : highlightPretty(rendered)}
      </pre>
    );
  }
  return <PairBodyFallback fallback={fallback} />;
}

function PairBodyFallback({ fallback }: { fallback?: string }) {
  const { t } = useTranslation();
  return <span className="block px-3 py-2 text-muted-foreground text-meta">{fallback ?? t('detail.noPayload')}</span>;
}
