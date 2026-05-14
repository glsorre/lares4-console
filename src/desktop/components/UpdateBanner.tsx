import { Download, RefreshCw, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { UpdaterState } from '../runtime/updater.js';

interface UpdateBannerProps {
  state: UpdaterState;
  onInstall: () => void;
  onDismiss: () => void;
}

function formatBytes(n: number | undefined): string {
  if (!n || n < 0) return '–';
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateBanner({ state, onInstall, onDismiss }: UpdateBannerProps) {
  if (state.phase === 'available') {
    return (
      <Alert className="mx-4 my-2 flex items-center gap-3 py-2">
        <Download className="size-4" aria-hidden />
        <div className="flex-1">
          <AlertTitle className="text-xs font-semibold">
            Update available — v{state.info.version}
          </AlertTitle>
          {state.info.body ? (
            <AlertDescription className="text-xs">{state.info.body}</AlertDescription>
          ) : null}
        </div>
        <Button size="sm" onClick={onInstall}>
          Install & restart
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss update">
          <X className="size-3.5" aria-hidden />
        </Button>
      </Alert>
    );
  }
  if (state.phase === 'installing') {
    const pct = state.total && state.total > 0
      ? Math.min(100, Math.round((state.downloaded / state.total) * 100))
      : undefined;
    return (
      <Alert className="mx-4 my-2 flex items-center gap-3 py-2">
        <RefreshCw className="size-4 animate-spin" aria-hidden />
        <div className="flex-1">
          <AlertTitle className="text-xs font-semibold">Downloading update…</AlertTitle>
          <AlertDescription className="text-xs">
            {formatBytes(state.downloaded)}
            {state.total ? ` of ${formatBytes(state.total)}` : ''}
            {pct !== undefined ? ` (${String(pct)}%)` : ''}
          </AlertDescription>
        </div>
      </Alert>
    );
  }
  return null;
}
