import { useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CommercialLicenseDialog } from './CommercialLicenseDialog';
import { FeatureGateEmptyState } from './FeatureGateEmptyState';
import type { FeatureId } from '../runtime/commercial-license-prefs';

type IconComp = ComponentType<SVGProps<SVGSVGElement>>;

interface ProFeatureLockProps {
  featureId: FeatureId;
  label: string;
  variant?: 'inline' | 'row' | 'icon' | 'pane';
  className?: string;
  /** Override tooltip text (icon variant especially benefits from a more specific hint). */
  tooltip?: string;
  /** When true, render the visuals only — no <button>. Use inside an already-clickable parent (e.g. TabsTrigger). */
  asDecoration?: boolean;
  /** Long-form pitch shown in the `pane` variant. */
  paneDescription?: string;
  /** Optional leading action icon (e.g. Plus for "New tab"). When set, Lock moves to the trailing slot. */
  leadingIcon?: IconComp;
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
  paneDescription,
  leadingIcon: LeadingIcon,
  onLicenseChanged,
}: ProFeatureLockProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tooltipText = tooltip ?? t('pro.lock.defaultTooltip');
  const ariaLabel = `${label} — ${tooltipText}`;

  if (variant === 'pane') {
    return (
      <>
        <FeatureGateEmptyState
          featureId={featureId}
          title={label}
          description={paneDescription ?? tooltipText}
          onUnlock={() => setOpen(true)}
          className={className}
        />
        <CommercialLicenseDialog
          open={open}
          onOpenChange={setOpen}
          featureId={featureId}
          onChanged={onLicenseChanged}
        />
      </>
    );
  }

  const isIcon = variant === 'icon';

  const content = isIcon ? (
    <Lock className="size-3 shrink-0" aria-hidden />
  ) : LeadingIcon ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <LeadingIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      <Lock className="ml-1 size-3 shrink-0 opacity-60" aria-hidden />
    </span>
  ) : (
    <span className="flex min-w-0 items-center gap-1.5">
      <Lock className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
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
