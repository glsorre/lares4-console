import { useTranslation } from 'react-i18next';
import { Check, ChevronLeft, ChevronRight, Copy, WrapText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LogTagChip } from './LogTagChip.js';
import { formatLogClock, getPrimaryTag, type buildMessageListItems } from '../../core/log-view.js';
import type { OutputFormat } from '../../core/types.js';

export type ViewMode = 'decoded' | 'pretty' | 'json';

interface LogDetailHeaderProps {
  selected: ReturnType<typeof buildMessageListItems>[number] | undefined;
  activeTs: string;
  lineCount: number;
  frameIdx: number;
  setFrameIdx: React.Dispatch<React.SetStateAction<number>>;
  frameCount: number;
  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  effectiveMode: ViewMode;
  canDecode: boolean;
  hasContent: boolean;
  wrapLines: boolean;
  setWrapLines: React.Dispatch<React.SetStateAction<boolean>>;
  onFormatChange?: (fmt: OutputFormat) => void;
  rendered: string;
  copied: boolean;
  onCopy: () => void;
}

export function LogDetailHeader({
  selected,
  activeTs,
  lineCount,
  frameIdx,
  setFrameIdx,
  frameCount,
  viewMode: _viewMode,
  setViewMode,
  effectiveMode,
  canDecode,
  hasContent,
  wrapLines,
  setWrapLines,
  onFormatChange,
  rendered,
  copied,
  onCopy,
}: LogDetailHeaderProps) {
  const { t } = useTranslation();
  void _viewMode;
  return (
    <div className="border-border/60 flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
      <div className="flex min-w-0 items-center gap-x-2 overflow-hidden">
        {selected ? (
          <div className="text-muted-foreground flex min-w-0 items-center gap-x-2 overflow-hidden">
            <LogTagChip tag={getPrimaryTag(selected)} />
            <span className="font-mono text-meta tabular-nums shrink-0">{formatLogClock(activeTs)}</span>
            {lineCount > 1 && (
              <>
                <span aria-hidden className="shrink-0 opacity-40">·</span>
                <span className="font-mono tabular-nums text-meta shrink-0">{t('detail.lines', { count: lineCount })}</span>
              </>
            )}
            {frameCount > 1 && (
              <>
                <span aria-hidden className="shrink-0 opacity-40">·</span>
                <div className="flex shrink-0 items-center gap-0.5" aria-label={t('detail.frameNavLabel')}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('detail.prevFrame')}
                        disabled={frameIdx === 0}
                        className="text-muted-foreground hover:text-foreground rounded p-0.5 disabled:opacity-30"
                        onClick={() => setFrameIdx((i) => Math.max(0, i - 1))}
                      >
                        <ChevronLeft className="size-3.5" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('detail.prevFrameTooltip')}</TooltipContent>
                  </Tooltip>
                  <span className="font-mono tabular-nums text-meta shrink-0" aria-live="polite">
                    {t('detail.frameProgress', { current: frameIdx + 1, total: frameCount })}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('detail.nextFrame')}
                        disabled={frameIdx >= frameCount - 1}
                        className="text-muted-foreground hover:text-foreground rounded p-0.5 disabled:opacity-30"
                        onClick={() => setFrameIdx((i) => Math.min(frameCount - 1, i + 1))}
                      >
                        <ChevronRight className="size-3.5" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('detail.nextFrameTooltip')}</TooltipContent>
                  </Tooltip>
                </div>
              </>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-meta">{t('detail.noSelection')}</span>
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
          disabled={!hasContent}
          className="bg-background/60 shadow-sm"
        >
          <ToggleGroupItem value="decoded" aria-label={t('detail.modeDecodedAria')} disabled={!hasContent || !canDecode} title={canDecode ? t('detail.modeDecodedTitleHas') : t('detail.modeDecodedTitleNone')}>
            {t('detail.modeDecoded')}
          </ToggleGroupItem>
          <ToggleGroupItem value="pretty" aria-label={t('detail.modePrettyAria')} disabled={!hasContent}>
            {t('detail.modePretty')}
          </ToggleGroupItem>
          <ToggleGroupItem value="json" aria-label={t('detail.modeJsonAria')} disabled={!hasContent}>
            {t('detail.modeJson')}
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
              aria-label={wrapLines ? t('detail.wrapDisableAria') : t('detail.wrapEnableAria')}
              aria-pressed={wrapLines}
              disabled={!hasContent}
            >
              <WrapText className="size-3.5" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{wrapLines ? t('detail.wrapDisableTooltip') : t('detail.wrapEnableTooltip')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
              disabled={!hasContent || !rendered}
              onClick={onCopy}
              aria-label={t('detail.copyAria')}
            >
              {copied ? <Check className="size-3.5 text-green-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? t('detail.copiedTooltip') : t('detail.copyTooltip')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
