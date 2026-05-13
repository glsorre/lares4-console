import type { ComponentType, SVGProps } from 'react';
import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface PaneEmptyProps {
  icon: LucideIcon;
  title: string;
  description: string;
  cta?: { label: string; onClick: () => void; icon?: LucideIcon };
  className?: string;
}

export function PaneEmpty({ icon: Icon, title, description, cta, className }: PaneEmptyProps) {
  const CtaIcon = cta?.icon ?? Plug;
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center', className)}>
      <div className="bg-muted/50 text-muted-foreground/60 ring-border/40 flex size-10 items-center justify-center rounded-full ring-1">
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <p className="text-foreground text-sm font-semibold tracking-tight">{title}</p>
        <p className="text-muted-foreground mx-auto max-w-[18rem] text-xs leading-relaxed">{description}</p>
      </div>
      {cta && (
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 gap-1.5 rounded-full px-3 text-xs"
          onClick={cta.onClick}
        >
          <CtaIcon className="size-3.5" aria-hidden />
          {cta.label}
        </Button>
      )}
    </div>
  );
}
