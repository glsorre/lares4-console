import { useTranslation } from 'react-i18next';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatsCluster } from './StatsBar.js';
import { useConnectionStatus, useLogEntries, usePendingTxCount } from '../runtime/session-store.js';

interface ConsoleTopBarLeftProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function ConsoleTopBarLeft({ sidebarOpen, onToggleSidebar }: ConsoleTopBarLeftProps) {
  const { t } = useTranslation();
  const { connected } = useConnectionStatus();
  const logEntries = useLogEntries();
  const pendingTxCount = usePendingTxCount();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 w-7 shrink-0 p-0"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? t('console.topBar.sidebarClose') : t('console.topBar.sidebarOpen')}
            aria-pressed={sidebarOpen}
          >
            {sidebarOpen
              ? <PanelLeftClose className="size-4" aria-hidden />
              : <PanelLeftOpen className="size-4" aria-hidden />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{sidebarOpen ? t('console.topBar.hideConnections') : t('console.topBar.showConnections')}</TooltipContent>
      </Tooltip>

      {connected && (
        <StatsCluster entries={logEntries} pendingTxCount={pendingTxCount} />
      )}
    </div>
  );
}
