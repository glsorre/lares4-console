import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FeatureId } from '../runtime/commercial-license-prefs';

interface FeatureGateEmptyStateProps {
  featureId: FeatureId;
  title: string;
  description: string;
  onUnlock: () => void;
  className?: string;
}

export function FeatureGateEmptyState({
  featureId,
  title,
  description,
  onUnlock,
  className,
}: FeatureGateEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center',
        className,
      )}
      data-feature={featureId}
    >
      <div className="bg-primary/10 text-primary ring-primary/25 flex size-12 items-center justify-center rounded-2xl ring-1">
        <Lock className="size-5" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <p className="font-heading text-foreground text-base font-semibold tracking-tight">
          {title}
        </p>
        <p className="text-muted-foreground mx-auto max-w-[22rem] text-xs leading-relaxed">
          {description}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="default"
        className="h-8 gap-1.5 rounded-full px-4 text-xs"
        onClick={onUnlock}
      >
        <Lock className="size-3.5" aria-hidden />
        Unlock
      </Button>
    </div>
  );
}
