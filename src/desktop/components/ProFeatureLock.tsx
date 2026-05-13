import { useState } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommercialLicenseDialog } from './CommercialLicenseDialog';
import type { FeatureId } from '../runtime/commercial-license-prefs';

const TOOLTIP = 'Pro feature — click to unlock';

interface ProFeatureLockProps {
  featureId: FeatureId;
  label: string;
  variant?: 'inline' | 'row';
  className?: string;
  onLicenseChanged?: () => void;
}

export function ProFeatureLock({
  featureId,
  label,
  variant = 'inline',
  className,
  onLicenseChanged,
}: ProFeatureLockProps) {
  const [open, setOpen] = useState(false);

  const base =
    'group inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';
  const sizing =
    variant === 'row'
      ? 'flex w-full justify-between px-2 py-1.5 text-xs font-semibold'
      : 'h-7 px-2 text-xs font-medium';

  return (
    <>
      <button
        type="button"
        className={cn(base, sizing, className)}
        onClick={() => setOpen(true)}
        title={TOOLTIP}
        aria-label={`${label} — ${TOOLTIP}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Lock className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <span className="text-primary text-[0.65rem] font-medium">Unlock</span>
      </button>

      <CommercialLicenseDialog
        open={open}
        onOpenChange={setOpen}
        featureId={featureId}
        onChanged={onLicenseChanged}
      />
    </>
  );
}
