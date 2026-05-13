import { useState } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CommercialLicenseDialog } from './CommercialLicenseDialog';
import type { FeatureId } from '../runtime/commercial-license-prefs';

const DEFAULT_TOOLTIP = 'Pro feature — click to unlock';

interface ProFeatureLockProps {
  featureId: FeatureId;
  label: string;
  variant?: 'inline' | 'row' | 'icon';
  className?: string;
  /** Override tooltip text (icon variant especially benefits from a more specific hint). */
  tooltip?: string;
  /** When true, render the visuals only — no <button>. Use inside an already-clickable parent (e.g. TabsTrigger). */
  asDecoration?: boolean;
  onLicenseChanged?: () => void;
}

const baseClasses =
  'group inline-flex shrink-0 items-center gap-1.5 rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground';
const interactive =
  'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

const sizingByVariant = {
  inline: 'h-7 px-2 text-xs font-medium',
  row: 'flex w-full justify-between px-2 py-1.5 text-xs font-semibold',
  icon: 'h-7 w-7 justify-center p-0',
} as const;

export function ProFeatureLock({
  featureId,
  label,
  variant = 'inline',
  className,
  tooltip,
  asDecoration = false,
  onLicenseChanged,
}: ProFeatureLockProps) {
  const [open, setOpen] = useState(false);
  const tooltipText = tooltip ?? DEFAULT_TOOLTIP;
  const ariaLabel = `${label} — ${tooltipText}`;

  const isIcon = variant === 'icon';

  const content = (
    <>
      <span className={cn('flex min-w-0 items-center gap-1.5', isIcon && 'gap-0')}>
        <Lock className="size-3 shrink-0" aria-hidden />
        {!isIcon && <span className="truncate">{label}</span>}
      </span>
      {!isIcon && <span className="text-primary text-[0.65rem] font-medium">Unlock</span>}
    </>
  );

  const sharedClass = cn(baseClasses, sizingByVariant[variant], !asDecoration && interactive, className);

  if (asDecoration) {
    return (
      <span className={sharedClass} aria-hidden={false} aria-label={ariaLabel}>
        {content}
      </span>
    );
  }

  const button = (
    <button
      type="button"
      className={sharedClass}
      onClick={() => setOpen(true)}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );

  return (
    <>
      {isIcon || tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{tooltipText}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <CommercialLicenseDialog
        open={open}
        onOpenChange={setOpen}
        featureId={featureId}
        onChanged={onLicenseChanged}
      />
    </>
  );
}
