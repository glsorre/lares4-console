import { useTranslation } from 'react-i18next';
import { Download, Eraser, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useConnectionStatus, useTopology } from '../runtime/session-store.js';

interface ConsoleTopBarActionsProps {
  msgCount: number;
  topologyRailOpen: boolean;
  onClearLogs: () => void;
  onExportLogs: () => void;
  onToggleTopologyRail: () => void;
}

export function ConsoleTopBarActions({
  msgCount,
  topologyRailOpen,
  onClearLogs,
  onExportLogs,
  onToggleTopologyRail,
}: ConsoleTopBarActionsProps) {
  const { t } = useTranslation();
  const { connected } = useConnectionStatus();
  const topology = useTopology();
  const deviceCount = topology.total;
  return (
    <div className="flex items-center gap-1">
      {msgCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-7 gap-1.5 text-xs"
              onClick={onExportLogs}
              aria-label={t('console.topBar.exportLogsAria')}
            >
              <Download className="size-3.5" aria-hidden />
              {t('console.topBar.exportLogsBtn')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('console.topBar.exportLogsTooltip')}</TooltipContent>
        </Tooltip>
      )}

      {msgCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-7 gap-1.5 text-xs"
              onClick={onClearLogs}
              aria-label={t('console.topBar.clearLogsAria')}
            >
              <Eraser className="size-3.5" aria-hidden />
              {t('console.topBar.clearLogsBtn')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('console.topBar.clearLogsTooltip')}</TooltipContent>
        </Tooltip>
      )}

      {connected && !topologyRailOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={onToggleTopologyRail}
              aria-label={t('console.topBar.openDevicesAria')}
              aria-pressed={topologyRailOpen}
            >
              <PanelRightOpen className="size-3.5" aria-hidden />
              {t('console.topBar.openDevicesBtn')}
              {deviceCount > 0 && (
                <span className="bg-muted text-muted-foreground rounded px-1 font-mono text-[0.6rem] tabular-nums">
                  {deviceCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('console.topBar.openDevicesTooltip')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
